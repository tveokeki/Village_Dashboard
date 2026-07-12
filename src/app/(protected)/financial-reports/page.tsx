"use client";

import { useEffect, useMemo, useState } from "react";
import FinancePageHeader from "@/components/finance/FinancePageHeader";
import KpiCard from "@/components/finance/KpiCard";
import FinanceStatusBadge from "@/components/finance/FinanceStatusBadge";
import { formatDate, formatMoney, numberValue, uatPath } from "@/components/finance/finance-format";
import { useLanguage } from "@/components/LanguageContext";
import * as XLSX from "xlsx-js-style";
import { Download } from "lucide-react";

type ReportType = "monthly" | "yearly" | "cash_flow" | "balance_sheet" | "profit_loss";

function Bar({ value, max, className = "bg-brand-500" }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div className="h-2 rounded-full bg-surface-100 overflow-hidden"><div className={`h-full rounded-full ${className}`} style={{ width: `${pct}%` }} /></div>;
}

function renderMoney(val: any, lang: "th" | "en", className = "") {
  const num = numberValue(val);
  const formatted = formatMoney(val, lang);
  if (num < 0) {
    return <span className={`text-red-600 font-semibold ${className}`}>{formatted}</span>;
  }
  return <span className={className}>{formatted}</span>;
}

export default function FinancialReportsPage() {
  const { lang } = useLanguage();
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const now = new Date();
  const [type, setType] = useState<ReportType>("monthly");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const exportToExcel = () => {
    if (!data) return;
    const workbook = XLSX.utils.book_new();

    if (type === "monthly") {
      const headers = [t("หมวดหมู่", "Category"), t("ประเภท", "Type"), t("จำนวนเงิน", "Amount")];
      const rowsData: any[] = [];

      (report.revenue_by_category || []).forEach((r: any) => {
        rowsData.push([r.category || "maintenance_fee", t("รายรับ", "Revenue"), numberValue(r.amount)]);
      });
      (report.expense_by_category || []).forEach((r: any) => {
        rowsData.push([r.category || "-", t("รายจ่าย", "Expense"), numberValue(r.amount)]);
      });

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rowsData]);

      const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
      for (let r = 1; r <= range.e.r; r++) {
        const addr = XLSX.utils.encode_cell({ r, c: 2 });
        if (worksheet[addr]) {
          worksheet[addr].t = "n";
          worksheet[addr].z = "#,##0.00";
        }
      }
      worksheet["!cols"] = [{ wch: 30 }, { wch: 15 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(workbook, worksheet, "Monthly Report");
    }
    else if (type === "yearly") {
      const headers = [t("เดือน", "Month"), t("รายรับ", "Revenue"), t("รายจ่าย", "Expense"), t("สุทธิ", "Net")];
      const rowsData = months.map((m: any) => [
        `${t("เดือน", "M")}${m.month}`,
        numberValue(m.revenue),
        numberValue(m.expense),
        numberValue(m.net)
      ]);
      rowsData.push([
        t("รวมทั้งปี", "Total Year"),
        totalYear.revenue,
        totalYear.expense,
        totalYear.net
      ]);
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rowsData]);
      const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
      for (let r = 1; r <= range.e.r; r++) {
        [1, 2, 3].forEach(c => {
          const addr = XLSX.utils.encode_cell({ r, c });
          if (worksheet[addr]) {
            worksheet[addr].t = "n";
            worksheet[addr].z = "#,##0.00";
          }
        });
      }
      worksheet["!cols"] = [{ wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(workbook, worksheet, "Yearly Report");
    }
    else if (type === "cash_flow") {
      const headers = [t("วันที่", "Date"), t("รายละเอียด", "Description"), t("เข้า", "In"), t("ออก", "Out"), t("คงเหลือ", "Balance"), t("สถานะ", "Status")];
      const rowsData = (data.rows || []).map((r: any) => [
        formatDate(r.transaction_date, lang),
        r.description || "",
        numberValue(r.cash_in),
        numberValue(r.cash_out),
        numberValue(r.remaining_balance),
        r.is_reconciled ? t("กระทบยอดแล้ว", "Reconciled") : t("รอดำเนินการ", "Pending")
      ]);
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rowsData]);
      const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
      for (let r = 1; r <= range.e.r; r++) {
        [2, 3, 4].forEach(c => {
          const addr = XLSX.utils.encode_cell({ r, c });
          if (worksheet[addr]) {
            worksheet[addr].t = "n";
            worksheet[addr].z = "#,##0.00";
          }
        });
      }
      worksheet["!cols"] = [{ wch: 15 }, { wch: 40 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(workbook, worksheet, "Cash Flow");
    }
    else if (type === "balance_sheet") {
      const headers = [t("รายการ", "Account Item"), t("จำนวนเงิน", "Amount")];
      const rowsData = [
        [t("สินทรัพย์", "Assets"), ""],
        [t("เงินฝากธนาคาร", "Bank cash"), numberValue(report.bank_cash)],
        [t("เงินสดย่อย", "Petty cash"), numberValue(report.petty_cash)],
        [t("ลูกหนี้ค่าส่วนกลาง", "Accounts receivable"), numberValue(report.accounts_receivable)],
        [t("สินทรัพย์รวม", "Total assets"), numberValue(report.total_assets)],
        ["", ""],
        [t("หนี้สินและทุนสมาชิก", "Liabilities & Equity"), ""],
        [t("ค่าใช้จ่ายค้างจ่าย", "Accrued expenses"), numberValue(report.accrued_expenses)],
        [t("หนี้สินรวม", "Total liabilities"), numberValue(report.total_liabilities)],
        [t("ทุนสมาชิก", "Members equity"), numberValue(report.members_equity)]
      ];
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rowsData]);
      const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
      for (let r = 1; r <= range.e.r; r++) {
        const addr = XLSX.utils.encode_cell({ r, c: 1 });
        if (worksheet[addr] && worksheet[addr].v !== "") {
          worksheet[addr].t = "n";
          worksheet[addr].z = "#,##0.00";
        }
      }
      worksheet["!cols"] = [{ wch: 35 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(workbook, worksheet, "Balance Sheet");
    }
    else if (type === "profit_loss") {
      const headers = [t("รายการ", "Item"), t("จำนวนเงิน", "Amount")];
      const rowsData = [
        [t("รายรับรับรู้", "Recognized revenue"), numberValue(report.recognized_revenue)],
        [t("รายจ่ายรับรู้", "Recognized expense"), numberValue(report.recognized_expense)],
        [t("กำไรสุทธิ", "Net income"), numberValue(report.net_income)]
      ];
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rowsData]);
      const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
      for (let r = 1; r <= range.e.r; r++) {
        const addr = XLSX.utils.encode_cell({ r, c: 1 });
        if (worksheet[addr]) {
          worksheet[addr].t = "n";
          worksheet[addr].z = "#,##0.00";
        }
      }
      worksheet["!cols"] = [{ wch: 30 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(workbook, worksheet, "Profit and Loss");
    }

    XLSX.writeFile(workbook, `FinancialReport_${type}_${year}.xlsx`);
  };

  async function loadReport() {
    setLoading(true); setMessage("");
    const params = new URLSearchParams({ type, year });
    if (type === "monthly") params.set("month", month);
    try {
      const res = await fetch(uatPath(`/api/finance/reports?${params.toString()}`), { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load report");
      setData(json);
    } catch (err: any) { setMessage(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { loadReport(); }, []);

  const report = data?.report || {};
  const months = data?.months || [];
  const totalYear = useMemo(() => months.reduce((acc: any, row: any) => ({ revenue: acc.revenue + numberValue(row.revenue), expense: acc.expense + numberValue(row.expense), net: acc.net + numberValue(row.net) }), { revenue: 0, expense: 0, net: 0 }), [months]);
  const maxMonth = Math.max(1, ...months.map((m: any) => Math.max(numberValue(m.revenue), numberValue(m.expense))));

  return <div className="py-6 min-w-0">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <FinancePageHeader title={t("รายงานการเงิน", "Financial Reports")} description={t("สรุปรายรับ รายจ่าย กระแสเงินสด และฐานะการเงิน", "Revenue, expense, cash flow, and financial position summaries")} />
      <button
        onClick={exportToExcel}
        disabled={!data}
        className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-bold text-white shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
      >
        <Download size={16} />
        {t("ส่งออก Excel", "Export Excel")}
      </button>
    </div>
    {message && <div className="mb-4 rounded-xl border px-4 py-3 text-sm bg-red-50 border-red-200 text-red-700">{message}</div>}

    <div className="card mb-6">
      <div className="grid md:grid-cols-4 gap-3">
        <select className="input-field md:col-span-2" value={type} onChange={(e) => setType(e.target.value as ReportType)}><option value="monthly">{t("รายเดือน", "Monthly")}</option><option value="yearly">{t("รายปี", "Yearly")}</option><option value="cash_flow">{t("กระแสเงินสด", "Cash Flow")}</option><option value="balance_sheet">{t("งบดุล", "Balance Sheet")}</option><option value="profit_loss">{t("กำไรขาดทุน", "Profit & Loss")}</option></select>
        <input className="input-field" value={year} onChange={(e) => setYear(e.target.value)} placeholder={t("ปี", "Year")} />
        {type === "monthly" ? <select className="input-field" value={month} onChange={(e) => setMonth(e.target.value)}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select> : <button onClick={loadReport} className="btn-primary">{t("แสดงรายงาน", "View report")}</button>}
        {type === "monthly" && <button onClick={loadReport} className="btn-primary md:col-start-4">{t("แสดงรายงาน", "View report")}</button>}
      </div>
    </div>

    {loading ? <div className="text-center py-12 text-surface-500">{t("กำลังโหลด...", "Loading...")}</div> : !data ? <div className="card text-center text-surface-500">{t("เลือกประเภทรายงานเพื่อแสดงผล", "Select a report type")}</div> : <>
      {type === "monthly" && <div className="space-y-6"><div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><KpiCard label={t("รายรับรวม", "Total revenue")} value={renderMoney(report.total_revenue, lang)} tone="emerald" /><KpiCard label={t("รายจ่ายรวม", "Total expense")} value={renderMoney(report.total_expense, lang)} tone="amber" /><KpiCard label={t("คงเหลือสุทธิ", "Net")} value={renderMoney(numberValue(report.total_revenue) - numberValue(report.total_expense), lang)} /><KpiCard label={t("อัตรารายจ่าย", "Expense ratio")} value={`${numberValue(report.total_revenue) ? Math.round(numberValue(report.total_expense) / numberValue(report.total_revenue) * 100) : 0}%`} tone="blue" /></div><div className="grid lg:grid-cols-2 gap-4"><CategoryBars title={t("รายรับตามหมวด", "Revenue by category")} rows={report.revenue_by_category || []} amountKey="amount" lang={lang} color="bg-brand-500" /><CategoryBars title={t("รายจ่ายตามหมวด", "Expense by category")} rows={report.expense_by_category || []} amountKey="amount" lang={lang} color="bg-amber-500" /></div></div>}
      {type === "yearly" && <div className="space-y-6"><div className="grid grid-cols-2 lg:grid-cols-3 gap-3"><KpiCard label={t("รายรับทั้งปี", "Year revenue")} value={renderMoney(totalYear.revenue, lang)} tone="emerald" /><KpiCard label={t("รายจ่ายทั้งปี", "Year expense")} value={renderMoney(totalYear.expense, lang)} tone="amber" /><KpiCard label={t("สุทธิ", "Net")} value={renderMoney(totalYear.net, lang)} /></div><div className="card space-y-3">{months.map((m: any) => <div key={m.month} className="grid md:grid-cols-[64px_1fr_1fr_120px] gap-3 items-center text-sm"><div className="font-medium">{t("เดือน", "M")}{m.month}</div><div><div className="flex justify-between text-xs mb-1"><span>{t("รายรับ", "Revenue")}</span><span>{renderMoney(m.revenue, lang)}</span></div><Bar value={numberValue(m.revenue)} max={maxMonth} /></div><div><div className="flex justify-between text-xs mb-1"><span>{t("รายจ่าย", "Expense")}</span><span>{renderMoney(m.expense, lang)}</span></div><Bar value={numberValue(m.expense)} max={maxMonth} className="bg-amber-500" /></div><div className="font-semibold text-right">{renderMoney(m.net, lang)}</div></div>)}</div></div>}
      {type === "cash_flow" && <div className="space-y-6"><div className="grid grid-cols-2 lg:grid-cols-3 gap-3"><KpiCard label={t("เงินเข้า", "Cash in")} value={renderMoney(data.totals?.cash_in, lang)} tone="emerald" /><KpiCard label={t("เงินออก", "Cash out")} value={renderMoney(data.totals?.cash_out, lang)} tone="red" /><KpiCard label={t("สุทธิ", "Net cash flow")} value={renderMoney(data.totals?.net_cash_flow, lang)} /></div><div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden"><div className="overflow-x-auto no-scrollbar"><table className="min-w-full text-sm"><thead className="bg-surface-50 text-surface-500"><tr><th className="p-3 text-left">{t("วันที่", "Date")}</th><th className="p-3 text-left">{t("รายละเอียด", "Description")}</th><th className="p-3 text-right">{t("เข้า", "In")}</th><th className="p-3 text-right">{t("ออก", "Out")}</th><th className="p-3 text-right">{t("คงเหลือ", "Balance")}</th><th className="p-3">{t("สถานะ", "Status")}</th></tr></thead><tbody>{(data.rows || []).map((r: any, i: number) => <tr key={i} className="border-t border-surface-100"><td className="p-3">{formatDate(r.transaction_date, lang)}</td><td className="p-3 break-words">{r.description}</td><td className="p-3 text-right">{renderMoney(r.cash_in, lang)}</td><td className="p-3 text-right">{renderMoney(r.cash_out, lang)}</td><td className="p-3 text-right">{renderMoney(r.remaining_balance, lang)}</td><td className="p-3"><FinanceStatusBadge status={Boolean(r.is_reconciled)} lang={lang} /></td></tr>)}</tbody></table></div></div></div>}
      {type === "balance_sheet" && <div className="grid lg:grid-cols-2 gap-4"><StatementCard title={t("สินทรัพย์", "Assets")} rows={[[t("เงินฝากธนาคาร", "Bank cash"), report.bank_cash], [t("เงินสดย่อย", "Petty cash"), report.petty_cash], [t("ลูกหนี้ค่าส่วนกลาง", "Accounts receivable"), report.accounts_receivable]]} total={[t("สินทรัพย์รวม", "Total assets"), report.total_assets]} lang={lang} /><StatementCard title={t("หนี้สินและทุนสมาชิก", "Liabilities & Equity")} rows={[[t("ค่าใช้จ่ายค้างจ่าย", "Accrued expenses"), report.accrued_expenses], [t("หนี้สินรวม", "Total liabilities"), report.total_liabilities]]} total={[t("ทุนสมาชิก", "Members equity"), report.members_equity]} lang={lang} /></div>}
      {type === "profit_loss" && <div className="space-y-6"><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><KpiCard label={t("รายรับรับรู้", "Recognized revenue")} value={renderMoney(report.recognized_revenue, lang)} tone="emerald" /><KpiCard label={t("รายจ่ายรับรู้", "Recognized expense")} value={renderMoney(report.recognized_expense, lang)} tone="amber" /><KpiCard label={t("กำไรสุทธิ", "Net income")} value={renderMoney(report.net_income, lang)} /></div><div className="card space-y-4"><div><div className="flex justify-between text-sm mb-1"><span>{t("รายรับ", "Revenue")}</span><b>{renderMoney(report.recognized_revenue, lang)}</b></div><Bar value={numberValue(report.recognized_revenue)} max={Math.max(numberValue(report.recognized_revenue), numberValue(report.recognized_expense), 1)} /></div><div><div className="flex justify-between text-sm mb-1"><span>{t("รายจ่าย", "Expense")}</span><b>{renderMoney(report.recognized_expense, lang)}</b></div><Bar value={numberValue(report.recognized_expense)} max={Math.max(numberValue(report.recognized_revenue), numberValue(report.recognized_expense), 1)} className="bg-amber-500" /></div></div></div>}
    </>}
  </div>;
}

function CategoryBars({ title, rows, amountKey, lang, color }: { title: string; rows: any[]; amountKey: string; lang: "th" | "en"; color: string }) {
  const max = Math.max(1, ...rows.map((r) => numberValue(r[amountKey])));
  return <div className="card"><h2 className="font-semibold text-surface-900 mb-4">{title}</h2><div className="space-y-3">{rows.length === 0 ? <p className="text-sm text-surface-500">-</p> : rows.map((r, i) => <div key={i}><div className="flex justify-between text-sm mb-1"><span className="break-words">{r.category || "maintenance_fee"}</span><span className="tabular-nums">{renderMoney(r[amountKey], lang)}</span></div><Bar value={numberValue(r[amountKey])} max={max} className={color} /></div>)}</div></div>;
}

function StatementCard({ title, rows, total, lang }: { title: string; rows: [string, any][]; total: [string, any]; lang: "th" | "en" }) {
  return <div className="card"><h2 className="font-semibold text-surface-900 mb-4">{title}</h2><div className="space-y-3">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-3 text-sm"><span className="text-surface-600">{label}</span><span className="font-medium tabular-nums text-right">{renderMoney(value, lang)}</span></div>)}<div className="border-t border-surface-200 pt-3 flex justify-between gap-3 font-bold text-brand-700"><span>{total[0]}</span><span className="text-right">{renderMoney(total[1], lang)}</span></div></div></div>;
}
