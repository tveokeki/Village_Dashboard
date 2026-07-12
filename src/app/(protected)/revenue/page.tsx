"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import FinancePageHeader from "@/components/finance/FinancePageHeader";
import KpiCard from "@/components/finance/KpiCard";
import FinanceStatusBadge from "@/components/finance/FinanceStatusBadge";
import { formatDate, formatMoney, uatPath } from "@/components/finance/finance-format";
import { useLanguage } from "@/components/LanguageContext";
import * as XLSX from "xlsx-js-style";
import { Download } from "lucide-react";

type FormMode = "payment" | "member" | "fee" | "edit_payment" | null;

function toDateInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDefaultRevenueFilters() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    q: "",
    status: "all",
    payment_type: "all",
    from: toDateInput(monthStart),
    to: toDateInput(monthEnd),
  };
}

export default function RevenuePage() {
  const { lang } = useLanguage();
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const [activeTab, setActiveTab] = useState<"common" | "other">("common");
  const [rows, setRows] = useState<any[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<any[]>([]);
  const [yearlyStats, setYearlyStats] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [feeOptions, setFeeOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [mode, setMode] = useState<FormMode>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [billSearch, setBillSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [filters, setFilters] = useState(() => getDefaultRevenueFilters());
  const [uploadedSlipId, setUploadedSlipId] = useState<string | null>(null);
  const [uploadingSlip, setUploadingSlip] = useState(false);
  const [uploadedSlipName, setUploadedSlipName] = useState<string | null>(null);
  const [addPaymentType, setAddPaymentType] = useState<string>("monthly");
  const [paymentTypes, setPaymentTypes] = useState<any[]>([]);

  const [viewingRow, setViewingRow] = useState<any | null>(null);
  const [viewingPaymentIndex, setViewingPaymentIndex] = useState<number>(0);
  const [imgZoom, setImgZoom] = useState<number>(1);
  const [imgRotate, setImgRotate] = useState<number>(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCloseDetail = () => {
    setViewingRow(null);
    setViewingPaymentIndex(0);
    setImgZoom(1);
    setImgRotate(0);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const exportToExcel = () => {
    const headers = [
      t("เลขที่รายการ", "Ref ID"),
      t("สมาชิก/บ้านเลขที่", "Member / House"),
      t("ประเภทรายรับ", "Revenue Type"),
      t("จำนวนเงิน", "Amount"),
      t("ช่องทางชำระเงิน", "Payment Channel"),
      t("วันเวลาชำระเงิน", "Payment Datetime"),
      t("สถานะ", "Status")
    ];

    const rowsData = rows.map((r) => [
      r.bank_ref_id || r.id,
      `${r.owner_name || r.payer_name_raw || "-"} (${r.house_number || "-"})`,
      displayPaymentTypes.find((t) => t.code === r.category_raw)?.label_th || r.category_raw || "-",
      Number(r.amount || 0),
      t(r.payment_method === "qr" ? "QR" : r.payment_method === "cash" ? "เงินสด" : "โอนผ่านธนาคาร", r.payment_method === "qr" ? "QR" : r.payment_method === "cash" ? "Cash" : "Bank Transfer"),
      formatDate(r.payment_date, lang),
      t(r.status === "confirmed" ? "ได้รับเงินแล้ว" : "รอดำเนินการ", r.status === "confirmed" ? "Confirmed" : "Pending")
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rowsData]);
    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
    for (let r = 1; r <= range.e.r; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: 3 });
      if (worksheet[addr]) {
        worksheet[addr].t = "n";
        worksheet[addr].z = "#,##0.00";
      }
    }
    worksheet["!cols"] = [
      { wch: 18 },
      { wch: 30 },
      { wch: 25 },
      { wch: 15 },
      { wch: 18 },
      { wch: 18 },
      { wch: 15 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Revenue Report");
    XLSX.writeFile(workbook, `RevenueReport_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  async function loadRevenue() {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams();
    params.set("tab", activeTab);
    Object.entries(filters).forEach(([k, v]) => { if (v && v !== "all") params.set(k, v); });
    try {
      const res = await fetch(uatPath(`/api/finance/revenue?${params.toString()}`), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load revenue");
      setRows(data.revenue || []);
      setMonthlyStats(data.monthly_stats || []);
      setYearlyStats(data.yearly_stats || []);
      setMembers(data.members || []);
      setFeeOptions(data.fee_options || []);
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { const timer = window.setTimeout(loadRevenue, 250); return () => window.clearTimeout(timer); }, [filters, activeTab]);

  async function loadDropdowns() {
    try {
      const res = await fetch(uatPath("/api/dropdown-options?groups=payment_type"));
      const data = await res.json();
      if (res.ok && data.groups && data.groups.payment_type) {
        setPaymentTypes(data.groups.payment_type);
      }
    } catch (err) {
      console.error("Failed to load payment types dropdown:", err);
    }
  }

  useEffect(() => {
    loadDropdowns();
  }, []);

  const defaultPaymentTypes = [
    { code: "monthly", label_th: "ค่าส่วนกลางรายเดือน", label_en: "Monthly Common Fee" },
    { code: "village_fund_2569", label_th: "เงินทุนเพื่อพัฒนาหมู่บ้านปี 2569", label_en: "Village Development Fund 2569" },
    { code: "retroactive_common_fee", label_th: "ค่าส่วนกลางย้อนหลัง", label_en: "Retroactive Common Fee" },
    { code: "deposit_interest", label_th: "ดอกเบี้ยเงินฝาก", label_en: "Bank Deposit Interest" },
    { code: "construction_deposit", label_th: "ค่าประกันการก่อสร้าง", label_en: "Construction Deposit" },
    { code: "fine", label_th: "ค่าปรับ", label_en: "Fine / Penalty" },
    { code: "other", label_th: "รายรับอื่น ๆ", label_en: "Other Revenue" },
  ];

  const displayPaymentTypes = paymentTypes.length > 0 ? paymentTypes : defaultPaymentTypes;

  const summarizeStats = (items: any[]) => {
    const byStatus: Record<string, any> = {};
    items.forEach((s) => { byStatus[s.status] = s; });
    return {
      pending: byStatus.pending || {},
      overdue: byStatus.overdue || {},
      paid: byStatus.paid || {},
    };
  };

  const totals = useMemo(() => summarizeStats(monthlyStats), [monthlyStats]);
  const yearlyTotals = useMemo(() => summarizeStats(yearlyStats), [yearlyStats]);

  const otherTotals = useMemo(() => {
    const byType: Record<string, any> = {};
    monthlyStats.forEach((s) => { byType[s.status] = s; });
    return {
      interest: byType.deposit_interest || { count: 0, total_due: 0 },
      deposit: byType.construction_deposit || { count: 0, total_due: 0 },
      fine: byType.fine || { count: 0, total_due: 0 },
      other: byType.other || { count: 0, total_due: 0 },
    };
  }, [monthlyStats]);

  const otherYearlyTotals = useMemo(() => {
    const byType: Record<string, any> = {};
    yearlyStats.forEach((s) => { byType[s.status] = s; });
    return {
      interest: byType.deposit_interest || { count: 0, total_due: 0 },
      deposit: byType.construction_deposit || { count: 0, total_due: 0 },
      fine: byType.fine || { count: 0, total_due: 0 },
      other: byType.other || { count: 0, total_due: 0 },
    };
  }, [yearlyStats]);

  function paymentTypeLabel(type: string) {
    switch (type) {
      case "monthly": return t("ค่าส่วนกลางรายเดือน", "Monthly Common Fee");
      case "village_fund_2569": return t("ค่ากองทุนพัฒนาหมู่บ้านปี 2569", "Village Development Fund 2026");
      case "deposit_interest": return t("ดอกเบี้ยเงินฝาก", "Bank Deposit Interest");
      case "construction_deposit": return t("ค่าประกันการก่อสร้าง", "Construction Deposit");
      case "fine": return t("ค่าปรับ", "Fine / Penalty");
      case "other": return t("รายรับอื่น ๆ", "Other Revenue");
      default: return type;
    }
  }


  function feeLabel(fee: any) {
    if (!fee) return "";
    return `${fee.owner_name || "-"} — ${t("บ้าน", "House")} ${fee.house_number} — ${formatDate(fee.period_start, lang)}-${formatDate(fee.period_end, lang)} — ${formatMoney(fee.amount_due, lang)}`;
  }

  const filteredFeeOptions = useMemo(() => {
    const query = billSearch.trim().toLowerCase();
    const source = selected && !query ? [selected] : feeOptions;
    if (!query) return source.slice(0, selected ? 1 : 0);
    return source.filter((fee) => feeLabel(fee).toLowerCase().includes(query)).slice(0, 25);
  }, [billSearch, feeOptions, selected, lang]);

  function memberLabel(member: any) {
    if (!member) return "";
    const fee = member.maintenance_fee ? ` — ${formatMoney(member.maintenance_fee, lang)}` : "";
    return `${member.owner_name || "-"} — ${t("บ้าน", "House")} ${member.house_number}${fee}`;
  }

  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    const source = selectedMember && !query ? [selectedMember] : members;
    if (!query) return source.slice(0, selectedMember ? 1 : 0);
    return source.filter((member) => memberLabel(member).toLowerCase().includes(query)).slice(0, 25);
  }, [memberSearch, members, selectedMember, lang]);

  function toDateInput(date: Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const autoFeeDefaults = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const due = new Date(now.getFullYear(), now.getMonth(), 10);
    return {
      period_start: toDateInput(start),
      period_end: toDateInput(end),
      due_date: toDateInput(due),
      amount_due: selectedMember?.maintenance_fee ? String(selectedMember.maintenance_fee) : "",
    };
  }, [selectedMember]);

  function openPayment(row?: any) {
    const fee = row || null;
    setSelected(fee);
    setBillSearch(fee ? feeLabel(fee) : "");
    setMode("payment");
    setSuccess("");
    setMessage("");
    setUploadedSlipId(null);
    setUploadedSlipName(null);
    if (!fee) {
      if (activeTab === "other") {
        setAddPaymentType("deposit_interest");
      } else {
        setAddPaymentType("monthly");
      }
    } else {
      setAddPaymentType(fee.payment_frequency || "monthly");
    }
  }

  const renderPaymentForm = () => {
    if (mode === "payment") {
      return (
<form onSubmit={(e) => submit(e, "payment")} className="grid md:grid-cols-3 gap-3">
            {addPaymentType === "monthly" ? (
              <div className="md:col-span-3 space-y-2">
                <label className="block text-xs font-medium text-surface-600">{t("ค้นหาและเลือกรอบบิล", "Search and select bill")}</label>
                <input
                  className="input-field"
                  value={billSearch}
                  onChange={(e) => { setBillSearch(e.target.value); setSelected(null); }}
                  placeholder={t("พิมพ์ชื่อเจ้าของ / บ้านเลขที่ / รอบบิล / ยอดเงิน เพื่อกรองรายการ", "Type owner / house no. / period / amount to filter bills")}
                  autoComplete="off"
                />
                <input type="hidden" name="maintenance_fee_id" value={selected?.id || ""} />
                <div className="rounded-xl border border-surface-200 bg-surface-50 max-h-72 overflow-y-auto">
                  <div className="px-3 py-2 text-xs text-surface-500 border-b border-surface-200">
                    {selected ? t("เลือกแล้ว", "Selected") : billSearch.trim() ? t(`แสดงผลสูงสุด ${filteredFeeOptions.length} รายการ`, `Showing up to ${filteredFeeOptions.length} matches`) : t("เริ่มพิมพ์เพื่อค้นหารอบบิล ไม่ต้อง scroll รายการทั้งหมด", "Start typing to search bills without scrolling the full list")}
                  </div>
                  {filteredFeeOptions.length > 0 ? (
                    filteredFeeOptions.map((fee: any) => (
                      <button
                        type="button"
                        key={fee.id}
                        onClick={() => { setSelected(fee); setBillSearch(feeLabel(fee)); }}
                        className={`w-full text-left px-3 py-2 text-sm border-b border-surface-100 last:border-b-0 hover:bg-white ${selected?.id === fee.id ? "bg-brand-50 text-brand-800" : "bg-transparent text-surface-700"}`}
                      >
                        <div className="font-medium">{fee.owner_name || "-"} — {t("บ้าน", "House")} {fee.house_number}</div>
                        <div className="text-xs text-surface-500">{formatDate(fee.period_start, lang)}-{formatDate(fee.period_end, lang)} • {formatMoney(fee.amount_due, lang)}</div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-4 text-sm text-surface-500">
                      {billSearch.trim() ? t("ไม่พบรอบบิลที่ตรงกับคำค้น", "No bills match this search") : t("ตัวอย่าง: พิมพ์ 39/2 หรือชื่อเจ้าของ", "Example: type 39/2 or owner name")}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="md:col-span-3 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-medium text-surface-600">
                    {t("ค้นหาและเลือกสมาชิก", "Search and select member")} {addPaymentType === "deposit_interest" || addPaymentType === "other" ? t("(ไม่เจาะจงรายบุคคล/เว้นว่างได้)", "(Optional)") : ""}
                  </label>
                  {selectedMember && (
                    <button type="button" onClick={() => { setSelectedMember(null); setMemberSearch(""); }} className="text-[10px] text-red-500 hover:underline font-semibold">
                      {t("✕ ล้างการเลือก", "✕ Clear selection")}
                    </button>
                  )}
                </div>
                <input
                  className="input-field"
                  value={memberSearch}
                  onChange={(e) => { setMemberSearch(e.target.value); setSelectedMember(null); }}
                  placeholder={t("พิมพ์ชื่อเจ้าของ / บ้านเลขที่ / ยอดค่าส่วนกลาง เพื่อกรองสมาชิก", "Type owner / house no. / maintenance fee to filter members")}
                  autoComplete="off"
                />
                <input type="hidden" name="member_id" value={selectedMember?.id || ""} />
                <div className="rounded-xl border border-surface-200 bg-surface-50 max-h-72 overflow-y-auto">
                  <div className="px-3 py-2 text-xs text-surface-500 border-b border-surface-200">
                    {selectedMember ? t("เลือกแล้ว", "Selected") : memberSearch.trim() ? t(`แสดงผลสูงสุด ${filteredMembers.length} รายการ`, `Showing up to ${filteredMembers.length} matches`) : t("เริ่มพิมพ์เพื่อค้นหาสมาชิก ไม่ต้อง scroll รายการทั้งหมด", "Start typing to search members without scrolling the full list")}
                  </div>
                  {filteredMembers.length > 0 ? (
                    filteredMembers.map((member: any) => (
                      <button
                        type="button"
                        key={member.id}
                        onClick={() => { setSelectedMember(member); setMemberSearch(memberLabel(member)); }}
                        className={`w-full text-left px-3 py-2 text-sm border-b border-surface-100 last:border-b-0 hover:bg-white ${selectedMember?.id === member.id ? "bg-brand-50 text-brand-800" : "bg-transparent text-surface-700"}`}
                      >
                        <div className="font-medium">{member.owner_name || "-"} — {t("บ้าน", "House")} {member.house_number}</div>
                        <div className="text-xs text-surface-500">{member.maintenance_fee ? formatMoney(member.maintenance_fee, lang) : t("ไม่มียอดค่าส่วนกลางในข้อมูลสมาชิก", "No maintenance fee on member record")}</div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-4 text-sm text-surface-500">
                      {memberSearch.trim() ? t("ไม่พบสมาชิกที่ตรงกับคำค้น", "No members match this search") : t("ตัวอย่าง: พิมพ์ 39/2 หรือชื่อเจ้าของ", "Example: type 39/2 or owner name")}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-medium text-surface-600">{t("จำนวนเงิน", "Amount")}</label>
              <input
                key={`amount-${selected?.id || "none"}`}
                name="amount_paid"
                defaultValue={selected?.amount_due ? parseFloat(String(selected.amount_due)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}
                className="input-field"
                placeholder={t("จำนวนเงิน", "Amount")}
                required
                onFocus={(e) => {
                  e.target.value = e.target.value.replace(/,/g, "");
                }}
                onBlur={(e) => {
                  const num = parseFloat(e.target.value.replace(/,/g, ""));
                  if (!isNaN(num)) {
                    e.target.value = num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  }
                }}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-surface-600">{t("ประเภทรายรับ", "Payment Type")}</label>
              <select
                key={`type-${selected?.id || "none"}`}
                name="payment_type"
                value={addPaymentType}
                onChange={(e) => {
                  setAddPaymentType(e.target.value);
                  setSelected(null);
                  setBillSearch("");
                  setSelectedMember(null);
                  setMemberSearch("");
                }}
                className="input-field font-semibold"
              >
                {displayPaymentTypes.map((type: any) => (
                  <option key={type.code} value={type.code}>{t(type.label_th, type.label_en)}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-surface-600">{t("วันที่ชำระเงิน", "Payment Date")}</label>
              <input name="payment_date" type="date" className="input-field" required />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-surface-600">{t("เลขที่ใบเสร็จ", "Receipt No.")}</label>
              <input name="receipt_number" className="input-field" placeholder={t("เลขที่ใบเสร็จ", "Receipt no.")} />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-surface-600">{t("ช่องทางการชำระ", "Method")}</label>
              <select
                name="payment_method"
                defaultValue="bank_transfer"
                className="input-field"
              >
                <option value="bank_transfer">{t("โอนเงินผ่านธนาคาร", "Bank Transfer")}</option>
                <option value="cash">{t("เงินสด", "Cash")}</option>
                <option value="qr">{t("โมบายแบงก์กิ้ง QR", "QR Code")}</option>
                <option value="cheque">{t("เช็ค", "Cheque")}</option>
                <option value="other">{t("ช่องทางอื่น", "Other")}</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-surface-600">{t("เลขที่รายการ", "Transaction Ref ID")}</label>
              <input
                name="transaction_ref_id"
                className="input-field font-mono"
                placeholder={t("เลขที่รายการ (เลขสลิป)", "Transaction Ref ID")}
              />
            </div>

            {/* UPLOAD PAYMENT SLIP BUTTON */}
            <div className="md:col-span-2 space-y-1.5 flex flex-col justify-end">
              <label className="block text-xs font-medium text-surface-600">
                {t("แนบหลักฐานการโอนเงิน (Payment Slip)", "Attach Payment Slip")}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  id="slip-upload-input"
                  className="hidden"
                  onChange={handleSlipUpload}
                />
                <label
                  htmlFor="slip-upload-input"
                  className={`px-4 py-2.5 rounded-xl border text-sm font-medium cursor-pointer transition-all flex items-center gap-2 ${
                    uploadingSlip
                      ? "bg-surface-50 border-surface-200 text-surface-400 cursor-not-allowed"
                      : uploadedSlipId
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100/50"
                        : "bg-white border-surface-200 text-surface-700 hover:bg-surface-50"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {uploadingSlip
                    ? t("กำลังอัปโหลด...", "Uploading...")
                    : uploadedSlipId
                      ? t("แนบสลิปเรียบร้อย", "Slip Attached (Change)")
                      : t("อัปโหลดสลิปโอนเงิน", "Upload Payment Slip")}
                </label>
                {uploadedSlipName && (
                  <span className="text-xs text-surface-500 font-medium truncate max-w-[200px]" title={uploadedSlipName}>
                    {uploadedSlipName}
                  </span>
                )}
              </div>
            </div>

            <div className="md:col-span-3 space-y-1">
              <label className="block text-xs font-medium text-surface-600">{t("หมายเหตุ", "Notes")}</label>
              <textarea name="notes" className="input-field" placeholder={t("หมายเหตุ", "Notes")} />
            </div>

            <button
              disabled={saving || (!selected && feeOptions.length === 0)}
              className="btn-primary md:col-span-3"
            >
              {saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}
            </button>
          </form>
      );
    }
    if (mode === "edit_payment") {
      return (
<form onSubmit={(e) => submit(e, "edit_payment")} className="grid md:grid-cols-3 gap-3">
            <input type="hidden" name="payment_id" value={viewingRow?.payments?.[viewingPaymentIndex]?.id || selected?.payments?.[viewingPaymentIndex]?.id || ""} />

            <div className="md:col-span-3 bg-surface-50 border border-surface-200 rounded-xl p-3 text-xs text-surface-600">
              <span className="font-bold">{t("กำลังแก้ไขรายการของ", "Editing Payment for")}:</span> {selected?.owner_name || "-"} ({t("บ้าน", "House")} {selected?.house_number})
              <div className="mt-1 font-semibold text-surface-500">
                {t("รอบบิล", "Period")}: {formatDate(selected?.period_start, lang)} - {formatDate(selected?.period_end, lang)}
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-surface-600">{t("จำนวนเงิน", "Amount")}</label>
              <input
                name="amount_paid"
                defaultValue={(() => {
                  const val = selected?.payments?.[viewingPaymentIndex]?.amount_paid || selected?.amount_paid || "";
                  return val ? parseFloat(String(val)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
                })()}
                className="input-field"
                placeholder={t("จำนวนเงิน", "Amount")}
                required
                onFocus={(e) => {
                  e.target.value = e.target.value.replace(/,/g, "");
                }}
                onBlur={(e) => {
                  const num = parseFloat(e.target.value.replace(/,/g, ""));
                  if (!isNaN(num)) {
                    e.target.value = num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  }
                }}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-surface-600">{t("ช่องทางการชำระ", "Method")}</label>
              <select
                name="payment_method"
                defaultValue={selected?.payments?.[viewingPaymentIndex]?.payment_method || "bank_transfer"}
                className="input-field"
              >
                <option value="bank_transfer">{t("โอนเงินผ่านธนาคาร", "Bank Transfer")}</option>
                <option value="cash">{t("เงินสด", "Cash")}</option>
                <option value="qr">{t("โมบายแบงก์กิ้ง QR", "QR Code")}</option>
                <option value="cheque">{t("เช็ค", "Cheque")}</option>
                <option value="other">{t("ช่องทางอื่น", "Other")}</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-surface-600">{t("วันที่ชำระเงิน", "Payment Date")}</label>
              <input
                name="payment_date"
                type="date"
                defaultValue={selected?.payments?.[viewingPaymentIndex]?.payment_date ? toDateInput(new Date(selected.payments[viewingPaymentIndex].payment_date)) : toDateInput(new Date())}
                className="input-field"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-surface-600">{t("เลขที่ใบเสร็จ", "Receipt No.")}</label>
              <input
                name="receipt_number"
                defaultValue={selected?.payments?.[viewingPaymentIndex]?.receipt_number || selected?.receipt_number || ""}
                className="input-field"
                placeholder={t("เลขที่ใบเสร็จ", "Receipt no.")}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-surface-600">{t("เลขที่รายการ", "Transaction Ref ID")}</label>
              <input
                name="transaction_ref_id"
                defaultValue={selected?.payments?.[viewingPaymentIndex]?.transaction_ref_id || ""}
                className="input-field font-mono"
                placeholder={t("เลขที่รายการ (เลขสลิป)", "Transaction Ref ID")}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-surface-600">{t("สถานะ", "Status")}</label>
              <select
                name="status"
                defaultValue={selected?.status || "pending"}
                className="input-field font-semibold"
              >
                <option value="pending">{t("รอดำเนินการ", "Pending")}</option>
                <option value="paid">{t("ชำระแล้ว", "Paid")}</option>
                <option value="overdue">{t("เกินกำหนด", "Overdue")}</option>
                <option value="waived">{t("ยกเว้น", "Waived")}</option>
                <option value="cancelled">{t("ยกเลิก", "Cancelled")}</option>
              </select>
            </div>

            {/* UPLOAD NEW PAYMENT SLIP BUTTON */}
            <div className="md:col-span-2 space-y-1.5 flex flex-col justify-end">
              <label className="block text-xs font-medium text-surface-600">
                {t("อัปโหลดสลิปใหม่ (เปลี่ยนภาพหลักฐาน)", "Upload New Slip (Replace Evidence)")}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  id="slip-upload-input-edit"
                  className="hidden"
                  onChange={handleSlipUpload}
                />
                <label
                  htmlFor="slip-upload-input-edit"
                  className={`px-4 py-2.5 rounded-xl border text-sm font-medium cursor-pointer transition-all flex items-center gap-2 ${
                    uploadingSlip
                      ? "bg-surface-50 border-surface-200 text-surface-400 cursor-not-allowed"
                      : uploadedSlipId
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100/50"
                        : "bg-white border-surface-200 text-surface-700 hover:bg-surface-50"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {uploadingSlip
                    ? t("กำลังอัปโหลด...", "Uploading...")
                    : uploadedSlipId
                      ? t("อัปโหลดสลิปใหม่แล้ว", "New Slip Attached")
                      : t("อัปโหลดภาพสลิปใหม่", "Upload New Slip")}
                </label>
                {uploadedSlipName ? (
                  <span className="text-xs text-surface-500 font-medium truncate max-w-[200px]" title={uploadedSlipName}>
                    {uploadedSlipName}
                  </span>
                ) : (
                  <span className="text-xs text-surface-400 italic">
                    {t("*ข้ามขั้นตอนนี้หากต้องการใช้สลิปภาพเดิม", "*Leave blank to preserve existing slip")}
                  </span>
                )}
              </div>
            </div>

            <div className="md:col-span-3 space-y-1">
              <label className="block text-xs font-medium text-surface-600">{t("หมายเหตุ", "Notes")}</label>
              <textarea
                name="notes"
                defaultValue={selected?.payments?.[viewingPaymentIndex]?.notes ? selected?.payments?.[viewingPaymentIndex]?.notes.replace(/\{"payment_slip_id":\s*"[^"]+"\}/, "").trim() : ""}
                className="input-field"
                placeholder={t("หมายเหตุ", "Notes")}
              />
            </div>

            <button
              disabled={saving}
              className="btn-primary md:col-span-3"
            >
              {saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึกการแก้ไข", "Save Changes")}
            </button>
          </form>
      );
    }
    return null;
  };

  async function handleSlipUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSlip(true);
    setMessage("");
    setSuccess("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(uatPath("/api/finance/revenue/slip-file"), {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setUploadedSlipId(data.payment_slip_id);
      setUploadedSlipName(data.file_name);
      setSuccess(t("อัปโหลดสลิปเรียบร้อยแล้วค่ะ", "Payment slip uploaded successfully"));
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setUploadingSlip(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>, action: "member" | "maintenance_fee" | "payment" | "edit_payment") {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const payload: any = { action };
    f.forEach((value, key) => {
      let val = String(value).trim();
      if (val) {
        if (["amount_paid", "amount_due", "maintenance_fee", "amount", "total_approved"].includes(key)) {
          val = val.replace(/,/g, "");
        }
        payload[key] = val;
      }
    });

    if (action === "payment") {
      const isFeeType = payload.payment_type === "monthly" || payload.payment_type === "village_fund_2569" || payload.payment_type === "retroactive_common_fee";
      if (isFeeType) {
        const chosenFee = selected || feeOptions.find((fee) => fee.id === payload.maintenance_fee_id);
        if (chosenFee) {
          payload.member_id ||= chosenFee.member_id;
          payload.maintenance_fee_id ||= chosenFee.id;
          payload.amount_paid ||= chosenFee.amount_due;
        }
        if (!payload.maintenance_fee_id) {
          setMessage(t("กรุณาค้นหาและเลือกรอบบิลก่อนบันทึก", "Please search and select a bill before saving"));
          return;
        }
      } else {
        payload.member_id = selectedMember?.id || null;
        payload.maintenance_fee_id = null;
      }

      if (uploadedSlipId) {
        payload.payment_slip_id = uploadedSlipId;
      }
    }
    if (action === "edit_payment") {
      if (uploadedSlipId) {
        payload.payment_slip_id = uploadedSlipId;
      }
    }
    if (action === "maintenance_fee") {
      const chosenMember = selectedMember || members.find((member) => member.id === payload.member_id);
      if (chosenMember) payload.member_id ||= chosenMember.id;
      if (!payload.member_id) {
        setMessage(t("กรุณาค้นหาและเลือกสมาชิกก่อนบันทึก", "Please search and select a member before saving"));
        return;
      }
    }
    setSaving(true); setMessage(""); setSuccess("");
    try {
      const res = await fetch(uatPath("/api/finance/revenue"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSuccess(t("บันทึกข้อมูลรายรับเรียบร้อย", "Revenue information saved"));
      formEl.reset(); setMode(null); setSelected(null); setBillSearch(""); setSelectedMember(null); setMemberSearch(""); await loadRevenue();
    } catch (err: any) { setMessage(err.message); } finally { setSaving(false); }
  }

  return (
    <div className="py-6 min-w-0">
      <FinancePageHeader
        title={activeTab === "common" ? t("รายรับค่าส่วนกลาง", "Common Fee Revenue") : t("รายรับประเภทอื่น ๆ", "Other Revenue")}
        description={activeTab === "common" ? t("ติดตามค่าส่วนกลาง รายการค้างชำระ และบันทึกการชำระเงิน", "Track maintenance fees, outstanding balances, and payment records") : t("บริหารจัดการรายรับดอกเบี้ยเงินฝาก ค่าประกันผลงาน เงินปรับ และรายรับเบ็ดเตล็ดส่วนกลาง", "Manage bank interest, construction deposits, fines, and miscellaneous central revenues")}
      >
        <div className="flex gap-2 w-full sm:w-auto flex-wrap justify-end">
          <button
            onClick={exportToExcel}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-bold text-white shadow-md hover:shadow-lg transition-all active:scale-[0.98] w-full sm:w-auto"
          >
            <Download size={16} />
            {t("ส่งออก Excel", "Export Excel")}
          </button>
          <button onClick={() => openPayment()} className="btn-primary w-full sm:w-auto">
            + {activeTab === "common" ? t("บันทึกชำระค่าส่วนกลาง", "Record Common Fee") : t("บันทึกรายรับอื่น ๆ (เช่น ดอกเบี้ย)", "Record Other Revenue")}
          </button>
          {activeTab === "common" && (
            <button onClick={() => { setMode("fee"); setSelectedMember(null); setMemberSearch(""); setSuccess(""); setMessage(""); }} className="px-4 py-2 rounded-xl border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50 w-full sm:w-auto">+ {t("รอบค่าส่วนกลาง", "Fee")}</button>
          )}
        </div>
      </FinancePageHeader>

      {/* Modern Tab Switcher */}
      <div className="flex gap-2 mb-6 border-b border-surface-200 pb-px">
        <button
          onClick={() => {
            setActiveTab("common");
            setFilters(getDefaultRevenueFilters());
          }}
          className={`px-5 py-2.5 text-sm font-semibold transition-all border-b-2 ${
            activeTab === "common"
              ? "border-brand-500 text-brand-600 font-bold"
              : "border-transparent text-surface-500 hover:text-surface-800"
          }`}
        >
          📄 {t("รายรับค่าส่วนกลาง", "Common Fee Revenue")}
        </button>
        <button
          onClick={() => {
            setActiveTab("other");
            setFilters(getDefaultRevenueFilters());
          }}
          className={`px-5 py-2.5 text-sm font-semibold transition-all border-b-2 ${
            activeTab === "other"
              ? "border-brand-500 text-brand-600 font-bold"
              : "border-transparent text-surface-500 hover:text-surface-800"
          }`}
        >
          🏦 {t("รายรับประเภทอื่น ๆ", "Other Revenue")}
        </button>
      </div>

      {message && <div className="mb-4 rounded-xl border px-4 py-3 text-sm bg-red-50 border-red-200 text-red-700">{message}</div>}
      {success && <div className="mb-4 rounded-xl border px-4 py-3 text-sm bg-brand-50 border-brand-100 text-brand-700">{success}</div>}

      {activeTab === "common" ? (
        <>
          <div className="mb-2 text-sm font-semibold text-surface-700">{t("สรุปเดือนปัจจุบัน", "Current month summary")}</div>
          <div className="grid grid-cols-3 gap-2 md:gap-3 mb-6">
            <KpiCard label={t("รอชำระ (เดือนนี้)", "Pending (this month)")} value={totals.pending.count || 0} hint={formatMoney(totals.pending.total_due, lang)} tone="amber" />
            <KpiCard label={t("เกินกำหนด (เดือนนี้)", "Overdue (this month)")} value={totals.overdue.count || 0} hint={formatMoney(totals.overdue.total_due, lang)} tone="red" />
            <KpiCard label={t("ชำระแล้ว (เดือนนี้)", "Paid (this month)")} value={totals.paid.count || 0} hint={formatMoney(totals.paid.total_due, lang)} tone="emerald" />
          </div>

          <div className="mb-2 text-sm font-semibold text-surface-700">{t("สรุปปีปัจจุบัน", "Current year summary")}</div>
          <div className="grid grid-cols-3 gap-2 md:gap-3 mb-6">
            <KpiCard label={t("รอชำระ (ปีนี้)", "Pending (this year)")} value={yearlyTotals.pending.count || 0} hint={formatMoney(yearlyTotals.pending.total_due, lang)} tone="amber" />
            <KpiCard label={t("เกินกำหนด (ปีนี้)", "Overdue (this year)")} value={yearlyTotals.overdue.count || 0} hint={formatMoney(yearlyTotals.overdue.total_due, lang)} tone="red" />
            <KpiCard label={t("ชำระแล้ว (ปีนี้)", "Paid (this year)")} value={yearlyTotals.paid.count || 0} hint={formatMoney(yearlyTotals.paid.total_due, lang)} tone="emerald" />
          </div>
        </>
      ) : (
        <>
          <div className="mb-2 text-sm font-semibold text-surface-700">{t("สรุปรายรับเบ็ดเตล็ดประจำปี", "Annual Other Revenue Summary")}</div>
          <div className="grid grid-cols-3 gap-2 md:gap-3 mb-6">
            <KpiCard label={t("ดอกเบี้ยธนาคาร (ปีนี้)", "Bank Interest (this year)")} value={otherYearlyTotals.interest.count || 0} hint={formatMoney(otherYearlyTotals.interest.total_due, lang)} tone="emerald" />
            <KpiCard label={t("เงินค้ำประกัน (ปีนี้)", "Construction Deposits (this year)")} value={otherYearlyTotals.deposit.count || 0} hint={formatMoney(otherYearlyTotals.deposit.total_due, lang)} tone="amber" />
            <KpiCard label={t("ค่าปรับ & อื่น ๆ (ปีนี้)", "Fines & Others (this year)")} value={(otherYearlyTotals.fine.count || 0) + (otherYearlyTotals.other.count || 0)} hint={formatMoney((otherYearlyTotals.fine.total_due || 0) + (otherYearlyTotals.other.total_due || 0), lang)} tone="emerald" />
          </div>
        </>
      )}

      <div className="card mb-6">
        <div className="grid md:grid-cols-7 gap-3 items-end">
          <div className="space-y-1 md:col-span-2">
            <label className="block text-[11px] font-medium text-surface-500">{t("ค้นหา", "Search")}</label>
            <input className="input-field" placeholder={t("ค้นหาบ้าน/เจ้าของ", "Search house or owner")} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} aria-label={t("ค้นหาบ้านหรือเจ้าของ", "Search house or owner")} />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-surface-500">{t("สถานะ", "Status")}</label>
            <select className="input-field" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} aria-label={t("สถานะ", "Status")}><option value="all">{t("ทุกสถานะ", "All statuses")}</option><option value="pending">{t("รอชำระ", "Pending")}</option><option value="overdue">{t("เกินกำหนด", "Overdue")}</option><option value="paid">{t("ชำระแล้ว", "Paid")}</option></select>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-surface-500">{t("ประเภท", "Type")}</label>
            <select className="input-field" value={filters.payment_type} onChange={(e) => setFilters({ ...filters, payment_type: e.target.value })} aria-label={t("ประเภท", "Type")}>
              <option value="all">{t("ทุกประเภท", "All types")}</option>
              {displayPaymentTypes.map((type: any) => (
                <option key={type.code} value={type.code}>{t(type.label_th, type.label_en)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-surface-500">{t("จาก", "From")}</label>
            <input className="input-field" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} aria-label={t("วันที่เริ่มต้น", "Start date")} />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-surface-500">{t("ถึง", "To")}</label>
            <input className="input-field" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} aria-label={t("วันที่สิ้นสุด", "End date")} />
          </div>
          <button className="px-4 py-2 rounded-xl bg-surface-100 text-sm self-end" onClick={() => setFilters(getDefaultRevenueFilters())}>{t("ล้าง", "Clear")}</button>
        </div>
      </div>

      {mode && (!selected || (mode !== "payment" && mode !== "edit_payment")) && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-surface-900">
              {mode === "payment"
                ? t("บันทึกการชำระเงิน", "Record payment")
                : mode === "edit_payment"
                ? t("แก้ไขข้อมูลการชำระเงิน", "Edit Payment")
                : mode === "member"
                ? t("เพิ่มสมาชิก", "Add member")
                : t("เพิ่มรอบค่าส่วนกลาง", "Add maintenance fee")}
            </h2>
            <button type="button" onClick={() => { setMode(null); setBillSearch(""); setSelected(null); setMemberSearch(""); setSelectedMember(null); }} className="text-sm text-surface-500 hover:text-surface-800">✕</button>
          </div>
          {mode === "payment" && renderPaymentForm()}
          {mode === "edit_payment" && renderPaymentForm()}
          {mode === "member" && <form onSubmit={(e) => submit(e, "member")} className="grid md:grid-cols-2 gap-3"><input name="house_number" className="input-field" placeholder={t("บ้านเลขที่", "House number")} required /><input name="owner_name" className="input-field" placeholder={t("ชื่อเจ้าของ", "Owner name")} required /><textarea name="notes" className="input-field md:col-span-2" placeholder={t("หมายเหตุ", "Notes")} /><button disabled={saving} className="btn-primary md:col-span-2">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button></form>}
          {mode === "fee" && <form onSubmit={(e) => submit(e, "maintenance_fee")} className="grid md:grid-cols-3 gap-3"><div className="md:col-span-3 space-y-2"><label className="block text-xs font-medium text-surface-600">{t("ค้นหาและเลือกสมาชิก", "Search and select member")}</label><input className="input-field" value={memberSearch} onChange={(e) => { setMemberSearch(e.target.value); setSelectedMember(null); }} placeholder={t("พิมพ์ชื่อเจ้าของ / บ้านเลขที่ / ยอดค่าส่วนกลาง เพื่อกรองสมาชิก", "Type owner / house no. / maintenance fee to filter members")} autoComplete="off" /><input type="hidden" name="member_id" value={selectedMember?.id || ""} /><div className="rounded-xl border border-surface-200 bg-surface-50 max-h-72 overflow-y-auto"><div className="px-3 py-2 text-xs text-surface-500 border-b border-surface-200">{selectedMember ? t("เลือกแล้ว", "Selected") : memberSearch.trim() ? t(`แสดงผลสูงสุด ${filteredMembers.length} รายการ`, `Showing up to ${filteredMembers.length} matches`) : t("เริ่มพิมพ์เพื่อค้นหาสมาชิก ไม่ต้อง scroll รายการทั้งหมด", "Start typing to search members without scrolling the full list")}</div>{filteredMembers.length > 0 ? filteredMembers.map((member: any) => <button type="button" key={member.id} onClick={() => { setSelectedMember(member); setMemberSearch(memberLabel(member)); }} className={`w-full text-left px-3 py-2 text-sm border-b border-surface-100 last:border-b-0 hover:bg-white ${selectedMember?.id === member.id ? "bg-brand-50 text-brand-800" : "bg-transparent text-surface-700"}`}><div className="font-medium">{member.owner_name || "-"} — {t("บ้าน", "House")} {member.house_number}</div><div className="text-xs text-surface-500">{member.maintenance_fee ? formatMoney(member.maintenance_fee, lang) : t("ไม่มียอดค่าส่วนกลางในข้อมูลสมาชิก", "No maintenance fee on member record")}</div></button>) : <div className="px-3 py-4 text-sm text-surface-500">{memberSearch.trim() ? t("ไม่พบสมาชิกที่ตรงกับคำค้น", "No members match this search") : t("ตัวอย่าง: พิมพ์ 39/2 หรือชื่อเจ้าของ", "Example: type 39/2 or owner name")}</div>}</div></div><div className="space-y-1"><label className="block text-xs font-medium text-surface-600">{t("วันที่เริ่มรอบบิล", "Billing period start")}</label><input key={`fee-start-${selectedMember?.id || "none"}`} name="period_start" type="date" className="input-field" defaultValue={autoFeeDefaults.period_start} required /></div><div className="space-y-1"><label className="block text-xs font-medium text-surface-600">{t("วันที่สิ้นสุดรอบบิล", "Billing period end")}</label><input key={`fee-end-${selectedMember?.id || "none"}`} name="period_end" type="date" className="input-field" defaultValue={autoFeeDefaults.period_end} required /></div><div className="space-y-1"><label className="block text-xs font-medium text-surface-600">{t("กำหนดชำระ", "Due date")}</label><input key={`fee-due-${selectedMember?.id || "none"}`} name="due_date" type="date" className="input-field" defaultValue={autoFeeDefaults.due_date} required /><p className="text-[11px] text-surface-500">{t("ระบบตั้งเป็นวันที่ 10 ให้อัตโนมัติ", "Auto-filled to the 10th")}</p></div><div className="space-y-1"><label className="block text-xs font-medium text-surface-600">{t("ยอดเรียกเก็บ", "Amount due")}</label><input key={`fee-amount-${selectedMember?.id || "none"}`} name="amount_due" type="text" className="input-field" placeholder={t("ยอดเรียกเก็บ", "Amount due")} defaultValue={autoFeeDefaults.amount_due ? parseFloat(String(autoFeeDefaults.amount_due)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""} required onFocus={(e) => { e.target.value = e.target.value.replace(/,/g, ""); }} onBlur={(e) => { const num = parseFloat(e.target.value.replace(/,/g, "")); if (!isNaN(num)) { e.target.value = num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } }} /></div><div className="space-y-1"><label className="block text-xs font-medium text-surface-600">{t("รอบการชำระ", "Payment frequency")}</label><select name="payment_frequency" className="input-field" defaultValue="monthly">{displayPaymentTypes.map((type: any) => (<option key={type.code} value={type.code}>{t(type.label_th, type.label_en)}</option>))}</select></div><button disabled={saving || members.length === 0} className="btn-primary md:col-span-3">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button></form>}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        {loading ? <div className="text-center py-12 text-surface-500">{t("กำลังโหลด...", "Loading...")}</div> : rows.length === 0 ? <div className="text-center py-12 text-surface-500">{activeTab === "common" ? t("ยังไม่มีรายการรายรับส่วนกลาง", "No common fee records yet") : t("ยังไม่มีรายการรายรับประเภทอื่น", "No other revenue records yet")}</div> : <>
          {/* Desktop view */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-50 text-surface-500">
                {activeTab === "common" ? (
                  <tr>
                    <th className="p-3 text-left">{t("บ้าน", "House")}</th>
                    <th className="p-3 text-left">{t("เจ้าของ", "Owner")}</th>
                    <th className="p-3 text-left">{t("รอบบิล", "Period")}</th>
                    <th className="p-3 text-left">{t("เลขที่รายการ", "Ref ID")}</th>
                    <th className="p-3 text-right">{t("ยอดเรียกเก็บ", "Due")}</th>
                    <th className="p-3 text-right">{t("ชำระแล้ว", "Paid")}</th>
                    <th className="p-3 text-left">{t("สถานะ", "Status")}</th>
                    <th className="p-3"></th>
                  </tr>
                ) : (
                  <tr>
                    <th className="p-3 text-left">{t("วันที่ชำระ", "Date")}</th>
                    <th className="p-3 text-left">{t("หมวดหมู่", "Category")}</th>
                    <th className="p-3 text-left">{t("รายละเอียด / หมายเหตุ", "Details / Notes")}</th>
                    <th className="p-3 text-left">{t("ผู้ชำระเงิน/อ้างอิงบ้าน", "Payer/House")}</th>
                    <th className="p-3 text-right">{t("จำนวนเงิน", "Amount")}</th>
                    <th className="p-3 text-left">{t("เลขที่ใบเสร็จ", "Receipt No.")}</th>
                    <th className="p-3 text-left">{t("สถานะ", "Status")}</th>
                    <th className="p-3"></th>
                  </tr>
                )}
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isPaid = (r.effective_status || r.status) === "paid" || r.status === "confirmed" || r.status === "reconciled";
                  const plainNotes = r.payments?.[0]?.notes
                    ? r.payments[0].notes.replace(/\{"payment_slip_id":\s*"[^"]+"[^}]*\}/, "")
                                         .replace(/\{"bank_ref_id":\s*"[^"]+"[^}]*\}/, "")
                                         .replace(/\{"promptpay_ref_id":\s*"[^"]+"[^}]*\}/, "")
                                         .trim()
                    : "";

                  return (
                    <Fragment key={r.id}>
                      <tr className="border-t border-b border-surface-200 hover:bg-surface-50 transition-colors odd:bg-white even:bg-surface-50/30">
                        {activeTab === "common" ? (
                          <>
                            <td className="p-3 font-medium">{r.house_number}</td>
                            <td className="p-3">{r.owner_name || "-"}</td>
                            <td className="p-3">{r.period_start ? `${formatDate(r.period_start, lang)} - ${formatDate(r.period_end, lang)}` : "-"}</td>
                            <td className="p-3 font-mono text-xs text-surface-500">{r.payments?.[0]?.transaction_ref_id || "-"}</td>
                            <td className="p-3 text-right tabular-nums">{formatMoney(r.amount_due, lang)}</td>
                            <td className="p-3 text-right tabular-nums">{formatMoney(r.amount_paid, lang)}</td>
                          </>
                        ) : (
                          <>
                            <td className="p-3 font-medium">{formatDate(r.due_date, lang)}</td>
                            <td className="p-3 font-semibold text-emerald-800">{paymentTypeLabel(r.payment_frequency)}</td>
                            <td className="p-3 max-w-[240px] truncate text-surface-600" title={plainNotes || "-"}>{plainNotes || "-"}</td>
                            <td className="p-3 font-medium">
                              {r.house_number && r.house_number !== "-" ? (
                                <span>{t("บ้าน", "House")} {r.house_number} ({r.owner_name})</span>
                              ) : (
                                <span className="text-surface-400 italic">-- {t("ส่วนกลาง", "Central / Juristic")} --</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-bold text-surface-900 tabular-nums">{formatMoney(r.amount_paid, lang)}</td>
                            <td className="p-3 font-mono text-xs text-surface-500">{r.payments?.[0]?.receipt_number || "-"}</td>
                          </>
                        )}
                        <td className="p-3">
                          <FinanceStatusBadge status={r.effective_status || r.status} lang={lang} />
                        </td>
                        <td className="p-3 text-right">
                          {isPaid ? (
                            <button
                              onClick={() => {
                                setViewingRow(r);
                                setViewingPaymentIndex(0);
                                setImgZoom(1);
                                setImgRotate(0);
                              }}
                              className="text-emerald-600 font-semibold hover:underline"
                            >
                              {t("ดูหลักฐาน", "View details")}
                            </button>
                          ) : (
                            <button onClick={() => openPayment(r)} className="text-brand-600 font-medium hover:underline">
                              {t("บันทึกชำระ", "Record")}
                            </button>
                          )}
                        </td>
                      </tr>
                      {((mode === "payment" || mode === "edit_payment") && selected?.id === r.id) && (
                        <tr>
                          <td colSpan={9} className="p-5 bg-surface-100/70 border-t-2 border-b-2 border-surface-300 shadow-inner">
                            <div className="flex items-center justify-between mb-4">
                              <h2 className="font-semibold text-surface-900">
                                {mode === "payment" ? t("บันทึกการชำระเงิน", "Record payment") : t("แก้ไขข้อมูลการชำระเงิน", "Edit Payment")}
                              </h2>
                              <button type="button" onClick={() => { setMode(null); setBillSearch(""); setSelected(null); setMemberSearch(""); setSelectedMember(null); }} className="text-sm text-surface-500 hover:text-surface-800">✕</button>
                            </div>
                            {renderPaymentForm()}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile view */}
          <div className="lg:hidden divide-y divide-surface-100">
            {rows.map((r) => {
              const isPaid = (r.effective_status || r.status) === "paid" || r.status === "confirmed" || r.status === "reconciled";
              const plainNotes = r.payments?.[0]?.notes
                ? r.payments[0].notes.replace(/\{"payment_slip_id":\s*"[^"]+"[^}]*\}/, "")
                                     .replace(/\{"bank_ref_id":\s*"[^"]+"[^}]*\}/, "")
                                     .replace(/\{"promptpay_ref_id":\s*"[^"]+"[^}]*\}/, "")
                                     .trim()
                : "";

              const status = r.effective_status || r.status;
              const statusBorders: Record<string, string> = {
                pending: "border-l-4 border-l-amber-500",
                overdue: "border-l-4 border-l-red-500",
                paid: "border-l-4 border-l-emerald-500",
                confirmed: "border-l-4 border-l-emerald-500",
                reconciled: "border-l-4 border-l-emerald-500",
              };
              const statusBg: Record<string, string> = {
                pending: "bg-amber-50/5",
                overdue: "bg-red-50/5",
                paid: "bg-emerald-50/5",
                confirmed: "bg-emerald-50/5",
                reconciled: "bg-emerald-50/5",
              };
              const cardBorder = statusBorders[status] || "border-l-4 border-l-surface-400";
              const cardBg = statusBg[status] || "bg-white";

              return (
                <div key={r.id} className={`p-4 mb-4 mx-2 rounded-2xl border border-surface-200 shadow-sm ${cardBorder} ${cardBg} transition-all`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {activeTab === "common" ? (
                        <>
                          <div className="font-semibold text-surface-900">{t("บ้าน", "House")} {r.house_number}</div>
                          <div className="text-sm text-surface-500 break-words">{r.owner_name || "-"}</div>
                        </>
                      ) : (
                        <>
                          <div className="font-bold text-emerald-800 text-base">{paymentTypeLabel(r.payment_frequency)}</div>
                          <div className="text-xs text-surface-400 font-mono mt-0.5">{formatDate(r.due_date, lang)}</div>
                        </>
                      )}
                    </div>
                    <FinanceStatusBadge status={r.effective_status || r.status} lang={lang} />
                  </div>

                  {activeTab === "common" ? (
                    <>
                      <div className="mt-3 rounded-xl bg-surface-50 border border-surface-100 px-3 py-2 text-sm">
                        <span className="text-surface-500">{t("รอบบิล", "Period")}</span>
                        <div className="font-semibold text-surface-900">{r.period_start ? `${formatDate(r.period_start, lang)} - ${formatDate(r.period_end, lang)}` : "-"}</div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-surface-500">{t("ยอด", "Due")}</span>
                          <div className="font-semibold">{formatMoney(r.amount_due, lang)}</div>
                        </div>
                        <div>
                          <span className="text-surface-500">{t("ชำระ", "Paid")}</span>
                          <div className="font-semibold">{formatMoney(r.amount_paid, lang)}</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mt-3 rounded-xl bg-surface-50 border border-surface-100 px-3 py-2 text-sm">
                        <span className="text-surface-500">{t("ผู้ชำระเงิน/อ้างอิงบ้าน", "Payer/House")}</span>
                        <div className="font-semibold text-surface-900">
                          {r.house_number && r.house_number !== "-" ? `${t("บ้าน", "House")} ${r.house_number} (${r.owner_name})` : t("ส่วนกลาง", "Central / Juristic")}
                        </div>
                      </div>
                      {plainNotes && (
                        <div className="mt-2 rounded-xl bg-surface-50 border border-surface-100 px-3 py-2 text-sm">
                          <span className="text-surface-500">{t("รายละเอียด", "Details")}</span>
                          <div className="font-medium text-surface-700 break-words">{plainNotes}</div>
                        </div>
                      )}
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-surface-500">{t("จำนวนเงิน", "Amount")}</span>
                          <div className="font-bold text-surface-900 text-base">{formatMoney(r.amount_paid, lang)}</div>
                        </div>
                        {r.payments?.[0]?.receipt_number && (
                          <div>
                            <span className="text-surface-500">{t("เลขที่ใบเสร็จ", "Receipt No.")}</span>
                            <div className="font-mono text-xs font-semibold text-surface-700 break-all">{r.payments[0].receipt_number}</div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {r.payments?.[0]?.transaction_ref_id && (
                    <div className="mt-3 rounded-xl bg-surface-50 border border-surface-100 px-3 py-2 text-sm">
                      <span className="text-surface-500">{t("เลขที่รายการ", "Ref ID")}</span>
                      <div className="font-mono text-xs font-semibold text-surface-700 break-all">
                        {r.payments[0].transaction_ref_id}
                      </div>
                    </div>
                  )}

                  {isPaid ? (
                    <button
                      onClick={() => {
                        setViewingRow(r);
                        setViewingPaymentIndex(0);
                        setImgZoom(1);
                        setImgRotate(0);
                      }}
                      className="mt-3 w-full rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 py-2.5 text-sm font-semibold hover:bg-emerald-100/50 transition-colors"
                    >
                      {t("ดูหลักฐานการชำระเงิน", "View payment details")}
                    </button>
                  ) : (
                    <button onClick={() => openPayment(r)} className="mt-3 w-full rounded-xl bg-brand-50 text-brand-700 py-2.5 text-sm font-medium hover:bg-brand-100/50 transition-colors">
                      {t("บันทึกชำระ", "Record payment")}
                    </button>
                  )}

                  {((mode === "payment" || mode === "edit_payment") && selected?.id === r.id) && (
                    <div className="mt-4 border-t border-surface-200 pt-4">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="font-semibold text-surface-900">
                          {mode === "payment" ? t("บันทึกการชำระเงิน", "Record payment") : t("แก้ไขข้อมูลการชำระเงิน", "Edit Payment")}
                        </h2>
                        <button type="button" onClick={() => { setMode(null); setBillSearch(""); setSelected(null); setMemberSearch(""); setSelectedMember(null); }} className="text-sm text-surface-500 hover:text-surface-800">✕</button>
                      </div>
                      {renderPaymentForm()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>}
      </div>

      {/* Pop-up modal for viewing payment details and verifying slip image */}
      {viewingRow && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface-950/40 backdrop-blur-sm transition-opacity duration-300">
          <div className="relative bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-surface-100 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-surface-100 px-6 py-4 bg-surface-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-surface-900 text-base sm:text-lg">
                    {t("รายละเอียดการชำระเงิน", "Payment Details")}
                  </h3>
                  <p className="text-xs text-surface-500 font-medium mt-0.5">
                    {t("บ้านเลขที่", "House No.")} <span className="text-surface-700 font-semibold">{viewingRow.house_number}</span> &bull; {viewingRow.owner_name || "-"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseDetail}
                className="w-8 h-8 rounded-full flex items-center justify-center text-surface-400 hover:text-surface-700 hover:bg-surface-100 active:scale-95 transition-all"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

              {/* Left Column: Metadata */}
              <div className="lg:col-span-5 flex flex-col gap-5">

                {/* Info Card Container */}
                <div className="border border-surface-100 rounded-2xl bg-surface-50/30 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider">{t("สถานะการชำระ", "Payment Status")}</span>
                    <span className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 border-emerald-200">
                      {t("ชำระแล้ว", "Paid")}
                    </span>
                  </div>

                  {/* Multiple Payments tabs if more than 1 payment */}
                  {viewingRow.payments && viewingRow.payments.length > 1 && (
                    <div className="space-y-1.5 border-t border-b border-surface-100 py-3 my-1">
                      <label className="block text-[11px] font-bold text-surface-400 uppercase tracking-wider">
                        {t(`ประวัติการชำระ (${viewingRow.payments.length} รายการ)`, `Payment History (${viewingRow.payments.length} records)`)}
                      </label>
                      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                        {viewingRow.payments.map((pm: any, idx: number) => (
                          <button
                            key={pm.id}
                            type="button"
                            onClick={() => {
                              setViewingPaymentIndex(idx);
                              setImgZoom(1);
                              setImgRotate(0);
                            }}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border whitespace-nowrap transition-all ${
                              viewingPaymentIndex === idx
                                ? "bg-brand-50 text-brand-700 border-brand-200 shadow-sm"
                                : "bg-white text-surface-600 border-surface-200 hover:bg-surface-50"
                            }`}
                          >
                            {formatMoney(pm.amount_paid, lang)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Current Selected Payment Display */}
                  {(() => {
                    const payment = viewingRow.payments?.[viewingPaymentIndex] || {
                      id: viewingRow.id,
                      amount_paid: viewingRow.amount_paid,
                      payment_date: viewingRow.last_payment_date || viewingRow.paid_at,
                      payment_method: "bank_transfer",
                      receipt_number: viewingRow.receipt_number
                    };

                    return (
                      <div className="space-y-4">
                        {/* Huge Amount */}
                        <div>
                          <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider block">{t("ยอดเงินที่ชำระ", "Amount Paid")}</span>
                          <span className="text-3xl font-black text-emerald-600 tracking-tight font-mono block mt-1">
                            {formatMoney(payment.amount_paid, lang)}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-surface-100 pt-4">
                          {/* Payment Date */}
                          <div className="space-y-1">
                            <span className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {t("วันที่ชำระเงิน", "Payment Date")}
                            </span>
                            <span className="text-sm font-semibold text-surface-700 block">
                              {formatDate(payment.payment_date, lang)}
                            </span>
                          </div>

                          {/* Payment Method */}
                          <div className="space-y-1">
                            <span className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                              </svg>
                              {t("ช่องทางการชำระ", "Method")}
                            </span>
                            <span className="text-sm font-semibold text-surface-700 block">
                              {payment.payment_method === "bank_transfer" ? t("โอนเงินผ่านธนาคาร", "Bank Transfer") :
                               payment.payment_method === "cash" ? t("เงินสด", "Cash") :
                               payment.payment_method === "qr" ? t("โมบายแบงก์กิ้ง QR", "QR Code") :
                               payment.payment_method === "cheque" ? t("เช็ค", "Cheque") :
                               t("ช่องทางอื่น", "Other")}
                            </span>
                          </div>
                        </div>

                        {/* Receipt Reference */}
                        <div className="space-y-1.5 border-t border-surface-100 pt-4">
                          <span className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            {t("เลขที่ใบเสร็จ / อ้างอิง", "Receipt No. / Ref ID")}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono font-bold text-surface-800 bg-surface-100 border border-surface-200 px-2.5 py-1 rounded-lg">
                              {payment.receipt_number || t("รอดำเนินการ", "Draft / Processing")}
                            </span>
                            {payment.receipt_number && (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(payment.receipt_number, payment.id)}
                                className="p-1.5 hover:bg-surface-100 rounded-lg text-surface-400 hover:text-surface-600 active:scale-90 transition-all"
                                title="Copy"
                              >
                                {copiedId === payment.id ? (
                                  <svg className="w-4 h-4 text-emerald-600 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                  </svg>
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Bank Transaction Ref */}
                        {payment.transaction_ref_id && (
                          <div className="space-y-1.5 border-t border-surface-100 pt-4">
                            <span className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {t("เลขที่อ้างอิงธนาคาร", "Bank Ref ID")}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-mono font-bold text-brand-600 bg-brand-50 border border-brand-100 px-2.5 py-1 rounded-lg">
                                {payment.transaction_ref_id}
                              </span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(payment.transaction_ref_id, "tx-" + payment.id)}
                                className="p-1.5 hover:bg-surface-100 rounded-lg text-surface-400 hover:text-surface-600 active:scale-90 transition-all"
                                title="Copy"
                              >
                                {copiedId === "tx-" + payment.id ? (
                                  <svg className="w-4 h-4 text-emerald-600 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                  </svg>
                                )}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Period and due */}
                        <div className="space-y-2 border-t border-surface-100 pt-4 text-xs">
                          <div className="flex justify-between">
                            <span className="text-surface-400 font-medium">{t("สำหรับรอบบิล", "Billing Period")}</span>
                            <span className="text-surface-700 font-bold">{formatDate(viewingRow.period_start, lang)} - {formatDate(viewingRow.period_end, lang)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-surface-400 font-medium">{t("กำหนดชำระ", "Payment Due Date")}</span>
                            <span className="text-surface-700 font-bold">{formatDate(viewingRow.due_date, lang)}</span>
                          </div>
                          {payment.notes && (
                            <div className="border-t border-surface-100 pt-2 mt-2">
                              <span className="text-[11px] text-surface-400 font-semibold block uppercase tracking-wider">{t("หมายเหตุ", "Notes")}</span>
                              <p className="text-surface-600 mt-1 italic font-medium">{payment.notes}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                </div>

                <div className="text-center text-[11px] text-surface-400 font-medium leading-relaxed px-3">
                  {t("หากต้องการตรวจสอบเชิงลึก กรุณาจับคู่กับรายการเดินบัญชีธนาคาร (Reconciliation)", "For thorough auditing, match this payment record with bank statements via Reconciliation.")}
                </div>
              </div>

              {/* Right Column: Slip Image and Tools */}
              <div className="lg:col-span-7 flex flex-col gap-3">
                <div className="text-xs font-semibold text-surface-500 uppercase tracking-wider px-1">
                  {t("หลักฐานการโอนเงิน (Payment Slip)", "Payment Slip Evidence")}
                </div>

                {/* Slip Viewer Canvas */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl relative overflow-hidden flex items-center justify-center min-h-[440px] max-h-[500px] shadow-2xl">

                  {/* Outer wrapper to restrict pointer-events while allowing zoom overflow */}
                  <div className="w-full h-full flex items-center justify-center p-4 overflow-hidden">

                    {(() => {
                      const payment = viewingRow.payments?.[viewingPaymentIndex] || {};
                      // In the database or folder structure, some entries might have slips.
                      // Let's use standard uat path or fallback placeholder if no file is found.
                      const slipUrl = payment.image_path || payment.slip_image_url || null;

                      if (slipUrl) {
                        return (
                          <img
                            src={uatPath(slipUrl)}
                            alt={t("หลักฐานการชำระเงิน", "Payment slip")}
                            className="max-w-full max-h-[400px] object-contain transition-transform duration-200 ease-out select-none"
                            style={{
                              transform: `scale(${imgZoom}) rotate(${imgRotate}deg)`,
                            }}
                            loading="lazy"
                          />
                        );
                      }

                      // Fallback: Professional, simple placeholder indicating no physical slip file exists
                      return (
                        <div className="text-center text-slate-400 p-6 flex flex-col items-center justify-center gap-2 select-none">
                          <svg className="w-12 h-12 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="font-semibold text-sm">{t("ไม่มีภาพสลิปหลักฐานการโอน", "No physical slip image found")}</span>
                          <span className="text-[11px] text-slate-500">{t("รายการนี้บันทึกโดยไม่มีการแนบไฟล์ภาพสลิป", "This record was saved without an attached slip file.")}</span>
                        </div>
                      );
                    })()}

                  </div>

                  {/* Toolbar overlay controls */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-950/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-800 flex items-center gap-3.5 text-white shadow-2xl transition-all hover:bg-slate-950">
                    {/* Zoom Out */}
                    <button
                      type="button"
                      onClick={() => setImgZoom(z => Math.max(z - 0.25, 0.5))}
                      className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-800 active:scale-90 transition-all text-slate-200 hover:text-white"
                      title={t("ซูมออก", "Zoom Out")}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                      </svg>
                    </button>

                    {/* Reset zoom */}
                    <span className="text-xs font-semibold tabular-nums select-none min-w-[36px] text-center text-slate-300">
                      {Math.round(imgZoom * 100)}%
                    </span>

                    {/* Zoom In */}
                    <button
                      type="button"
                      onClick={() => setImgZoom(z => Math.min(z + 0.25, 3))}
                      className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-800 active:scale-90 transition-all text-slate-200 hover:text-white"
                      title={t("ซูมเข้า", "Zoom In")}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </button>

                    <div className="w-[1px] h-4 bg-slate-800"></div>

                    {/* Rotate */}
                    <button
                      type="button"
                      onClick={() => setImgRotate(r => (r + 90) % 360)}
                      className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-800 active:scale-90 transition-all text-slate-200 hover:text-white"
                      title={t("หมุนภาพ", "Rotate")}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 15.89M9 11l3-3 3 3" />
                      </svg>
                    </button>

                    {/* Reset all */}
                    <button
                      type="button"
                      onClick={() => { setImgZoom(1); setImgRotate(0); }}
                      className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-800 active:scale-90 transition-all text-slate-200 hover:text-white"
                      title={t("จัดตำแหน่งใหม่", "Reset")}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 15.89" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center text-[10px] sm:text-[11px] text-surface-400 font-medium px-1">
                  <span>* {t("ภาพจำลองขึ้นอยู่กับข้อมูลระบบกรณีไม่พบไฟล์ภาพจริง", "Rendered digital replica if no physical slip image is found.")}</span>
                  {(viewingRow.payments?.[viewingPaymentIndex]?.image_path || viewingRow.payments?.[viewingPaymentIndex]?.slip_image_url) && (
                    <a
                      href={uatPath(viewingRow.payments?.[viewingPaymentIndex]?.image_path || viewingRow.payments?.[viewingPaymentIndex]?.slip_image_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-600 font-bold hover:underline"
                    >
                      {t("เปิดรูปต้นฉบับ ↗", "Open original slip ↗")}
                    </a>
                  )}
                </div>

              </div>

            </div>

            {/* Footer */}
            <div className="border-t border-surface-100 bg-surface-50 px-6 py-4 flex justify-end gap-3 rounded-b-3xl">
              <button
                type="button"
                onClick={() => {
                  setSelected(viewingRow);
                  setMode("edit_payment");
                  setViewingRow(null);
                  setSuccess("");
                  setMessage("");
                  setUploadedSlipId(null);
                  setUploadedSlipName(null);
                }}
                className="px-5 py-2.5 rounded-xl border border-brand-200 bg-brand-50 text-sm font-semibold text-brand-700 hover:bg-brand-100/50 transition-all active:scale-[0.98]"
              >
                {t("แก้ไขข้อมูลการชำระเงิน", "Edit Payment")}
              </button>
              <button
                type="button"
                onClick={handleCloseDetail}
                className="px-5 py-2.5 rounded-xl border border-surface-200 bg-white text-sm font-semibold text-surface-700 hover:bg-surface-50 transition-all active:scale-[0.98]"
              >
                {t("ปิด", "Close")}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
