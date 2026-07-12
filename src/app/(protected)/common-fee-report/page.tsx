"use client";

import { useEffect, useMemo, useState } from "react";
import FinancePageHeader from "@/components/finance/FinancePageHeader";
import { formatDate, formatMoney, uatPath } from "@/components/finance/finance-format";
import { useLanguage } from "@/components/LanguageContext";
import * as XLSX from "xlsx-js-style";
import { Download } from "lucide-react";

type Period = {
  key: string;
  period_start: string;
  period_end: string;
  due_date: string | null;
  label_th: string;
  label_en: string;
};

type Cell = {
  period_key: string;
  maintenance_fee_id: string | null;
  amount_due: number;
  amount_paid: number;
  status: "paid" | "overdue" | "pending" | "none";
  due_date: string | null;
  last_payment_date: string | null;
};

type ReportRow = {
  member_id: string;
  house_number: string;
  owner_name: string | null;
  land_type?: string | null;
  cells: Cell[];
  summary: {
    paid: number;
    overdue: number;
    pending: number;
    total_due: number;
    total_paid: number;
  };
};

function isoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function defaultRange() {
  const now = new Date();
  return { from: `${now.getFullYear()}-01-01`, to: isoDate(now) };
}

function statusLabel(status: Cell["status"], lang: "th" | "en") {
  const labels = {
    paid: { th: "ชำระแล้ว", en: "Paid" },
    overdue: { th: "เกินกำหนด", en: "Overdue" },
    pending: { th: "รอชำระ", en: "Pending" },
    none: { th: "ไม่มีรอบบิล", en: "No bill" },
  } as const;
  return labels[status][lang];
}

function statusClass(status: Cell["status"]) {
  if (status === "paid") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "overdue") return "bg-red-50 text-red-800 border-red-200";
  if (status === "pending") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-surface-50 text-surface-500 border-surface-200";
}

function StatusPill({ status, lang }: { status: Cell["status"]; lang: "th" | "en" }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold whitespace-nowrap ${statusClass(status)}`}>
      {statusLabel(status, lang)}
    </span>
  );
}

export default function CommonFeeReportPage() {
  const { lang } = useLanguage();
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const defaults = useMemo(() => defaultRange(), []);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const exportToExcel = () => {
    const ownerHeader = t("เจ้าของ / บ้านเลขที่", "Owner / House");
    const periodHeaders = periods.map((period) => (lang === "th" ? period.label_th : period.label_en));
    const summaryHeaders = [
      t("สรุป: ชำระแล้ว", "Summary: Paid"),
      t("สรุป: เกินกำหนด", "Summary: Overdue"),
      t("สรุป: รอชำระ", "Summary: Pending"),
      t("สรุป: รวมยอดที่ต้องชำระ", "Summary: Total Due"),
      t("สรุป: รวมยอดที่ชำระแล้ว", "Summary: Total Paid"),
    ];
    const headers = [ownerHeader, ...periodHeaders, ...summaryHeaders];

    const excelRows = rows.map((row) => {
      const values: (string | number)[] = [`${row.owner_name || "-"} (${row.house_number})`];

      periods.forEach((period) => {
        const cell = row.cells.find((c) => c.period_key === period.key);
        values.push(cell?.status === "paid" ? Number(cell.amount_paid || 0) : "");
      });

      values.push(
        row.summary.paid,
        row.summary.overdue,
        row.summary.pending,
        Number(row.summary.total_due || 0),
        Number(row.summary.total_paid || 0)
      );
      return values;
    });

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...excelRows]);
    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
    const greenFill = { patternType: "solid", fgColor: { rgb: "D1FAE5" } };
    const greenFont = { color: { rgb: "047857" }, bold: true };
    const headerStyle = {
      font: { bold: true, color: { rgb: "334155" } },
      fill: { patternType: "solid", fgColor: { rgb: "F8FAFC" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: { bottom: { style: "thin", color: { rgb: "CBD5E1" } } },
    };

    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const headerAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      worksheet[headerAddress].s = headerStyle;
    }

    rows.forEach((row, rowIndex) => {
      const excelRow = rowIndex + 1;
      periods.forEach((period, periodIndex) => {
        const excelCol = periodIndex + 1;
        const address = XLSX.utils.encode_cell({ r: excelRow, c: excelCol });
        const matchingCell = row.cells.find((c) => c.period_key === period.key);
        const worksheetCell = worksheet[address];
        if (worksheetCell && matchingCell?.status === "paid") {
          worksheetCell.t = "n";
          worksheetCell.z = "#,##0.00";
          worksheetCell.s = {
            fill: greenFill,
            font: greenFont,
            alignment: { horizontal: "right", vertical: "center" },
          };
        }
      });
    });

    const totalDueCol = headers.indexOf(t("สรุป: รวมยอดที่ต้องชำระ", "Summary: Total Due"));
    const totalPaidCol = headers.indexOf(t("สรุป: รวมยอดที่ชำระแล้ว", "Summary: Total Paid"));
    for (let rowIndex = 1; rowIndex <= range.e.r; rowIndex += 1) {
      [totalDueCol, totalPaidCol].forEach((col) => {
        if (col >= 0) {
          const address = XLSX.utils.encode_cell({ r: rowIndex, c: col });
          if (worksheet[address]) worksheet[address].z = "#,##0.00";
        }
      });
    }

    worksheet["!cols"] = headers.map((header, index) => ({
      wch: index === 0 ? 34 : Math.max(14, Math.min(28, String(header).length + 4)),
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Common Fee Report");
    XLSX.writeFile(workbook, `CommonFeeReport_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  async function loadReport() {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ from, to, limit: "500" });
    if (q.trim()) params.set("q", q.trim());
    try {
      const res = await fetch(uatPath(`/api/finance/common-fee-report?${params.toString()}`), { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load common fee report");
      setPeriods(json.periods || []);
      setRows(json.rows || []);
    } catch (err: any) {
      setMessage(err.message || "Failed to load common fee report");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(loadReport, 250);
    return () => window.clearTimeout(timer);
  }, [q, from, to]);

  const totals = useMemo(() => rows.reduce(
    (acc, row) => {
      acc.paid += row.summary?.paid || 0;
      acc.overdue += row.summary?.overdue || 0;
      acc.pending += row.summary?.pending || 0;
      acc.total_due += Number(row.summary?.total_due || 0);
      acc.total_paid += Number(row.summary?.total_paid || 0);
      return acc;
    },
    { paid: 0, overdue: 0, pending: 0, total_due: 0, total_paid: 0 }
  ), [rows]);

  return (
    <div className="py-6 min-w-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <FinancePageHeader
          title={t("รายงานค่าส่วนกลาง", "Common Fee Report")}
          description={t(
            "แสดงประวัติการจ่ายค่าส่วนกลางรายเจ้าของ แยกตามรอบบิลในช่วงวันที่ที่เลือก",
            "Per-owner maintenance-fee payment history by billing period in the selected date range"
          )}
        />
        <button
          onClick={exportToExcel}
          disabled={rows.length === 0}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-bold text-white shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
        >
          <Download size={16} />
          {t("ส่งออก Excel", "Export Excel")}
        </button>
      </div>

      {message && <div className="mb-4 rounded-xl border px-4 py-3 text-sm bg-red-50 border-red-200 text-red-700">{message}</div>}

      <div className="card mb-6">
        <div className="grid md:grid-cols-[1.5fr_1fr_1fr_auto] gap-3 items-end">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-surface-600">{t("ค้นหาชื่อเจ้าของ / บ้านเลขที่", "Search owner / house number")}</label>
            <input
              className="input-field"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("เช่น สมชาย หรือ 39/2", "e.g. owner name or 39/2")}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-surface-600">{t("จากวันที่", "From date")}</label>
            <input type="date" className="input-field" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-surface-600">{t("ถึงวันที่", "To date")}</label>
            <input type="date" className="input-field" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button
            className="px-4 py-2 rounded-xl border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50"
            onClick={() => { setQ(""); setFrom(defaults.from); setTo(defaults.to); }}
          >
            {t("ล้าง", "Reset")}
          </button>
        </div>
        <div className="mt-3 text-xs text-surface-500">
          {t("ค่าเริ่มต้นคือ 1 มกราคมของปีปัจจุบัน ถึงวันที่ปัจจุบัน", "Default range is January 1 of the current year through today")}
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <SummaryCard label={t("เจ้าของ", "Owners")} value={rows.length.toLocaleString(lang === "th" ? "th-TH" : "en-US")} />
        <SummaryCard label={t("รอบบิล", "Periods")} value={periods.length.toLocaleString(lang === "th" ? "th-TH" : "en-US")} />
        <SummaryCard label={t("ชำระแล้ว", "Paid")} value={totals.paid.toLocaleString(lang === "th" ? "th-TH" : "en-US")} tone="emerald" />
        <SummaryCard label={t("เกินกำหนด", "Overdue")} value={totals.overdue.toLocaleString(lang === "th" ? "th-TH" : "en-US")} tone="red" />
        <SummaryCard label={t("รอชำระ", "Pending")} value={totals.pending.toLocaleString(lang === "th" ? "th-TH" : "en-US")} tone="amber" />
      </div>
      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-surface-500">{t("กำลังโหลด...", "Loading...")}</div>
        ) : periods.length === 0 ? (
          <div className="text-center py-12 text-surface-500">{t("ไม่พบรอบบิลในช่วงเวลาที่เลือก", "No billing periods found in the selected range")}</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-surface-500">{t("ไม่พบเจ้าของ/บ้านเลขที่ที่ตรงกับตัวกรอง", "No owners or houses match the filters")}</div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-50 text-surface-500">
                <tr>
                  <th className="sticky left-0 z-10 bg-surface-50 p-3 text-left min-w-56 border-r border-surface-200">
                    {t("เจ้าของ / บ้านเลขที่", "Owner / House")}
                  </th>
                  {periods.map((period) => (
                    <th key={period.key} className="p-3 text-center min-w-36">
                      <div className="font-semibold text-surface-700">{lang === "th" ? period.label_th : period.label_en}</div>
                      <div className="text-[11px] text-surface-400 font-normal">{formatDate(period.period_start, lang)} - {formatDate(period.period_end, lang)}</div>
                    </th>
                  ))}
                  <th className="p-3 text-center min-w-32">{t("สรุป", "Summary")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.member_id} className="border-t border-surface-100 hover:bg-surface-50/60">
                    <td className="sticky left-0 z-10 bg-white p-3 border-r border-surface-100 align-top">
                      <div className="font-semibold text-surface-900 break-words">{row.owner_name || "-"}</div>
                      <div className="text-xs text-surface-500">{t("บ้าน", "House")} {row.house_number}</div>
                    </td>
                    {row.cells.map((cell) => (
                      <td key={`${row.member_id}-${cell.period_key}`} className="p-3 text-center align-top">
                        <div className="space-y-1">
                          <StatusPill status={cell.status} lang={lang} />
                          {cell.status !== "none" && (
                            <>
                              <div className="text-[11px] text-surface-500 tabular-nums">{formatMoney(cell.amount_due, lang)}</div>
                              {cell.amount_paid > 0 && <div className="text-[11px] text-emerald-700 tabular-nums">{t("จ่าย", "Paid")} {formatMoney(cell.amount_paid, lang)}</div>}
                            </>
                          )}
                        </div>
                      </td>
                    ))}
                    <td className="p-3 text-xs align-top text-surface-600">
                      <div className="whitespace-nowrap">✅ {row.summary.paid} · ⏰ {row.summary.overdue} · 🟡 {row.summary.pending}</div>
                      <div className="mt-1 whitespace-nowrap">{formatMoney(row.summary.total_paid, lang)} / {formatMoney(row.summary.total_due, lang)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone = "surface" }: { label: string; value: string; tone?: "surface" | "emerald" | "red" | "amber" }) {
  const toneClass = {
    surface: "bg-white border-surface-200 text-surface-900",
    emerald: "bg-emerald-50 border-emerald-100 text-emerald-800",
    red: "bg-red-50 border-red-100 text-red-800",
    amber: "bg-amber-50 border-amber-100 text-amber-800",
  }[tone];
  return <div className={`rounded-2xl border shadow-sm p-4 ${toneClass}`}><div className="text-xs font-medium opacity-75">{label}</div><div className="mt-2 text-2xl font-bold tabular-nums">{value}</div></div>;
}
