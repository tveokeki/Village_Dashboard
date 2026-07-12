"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import FinancePageHeader from "@/components/finance/FinancePageHeader";
import FinanceStatusBadge from "@/components/finance/FinanceStatusBadge";
import { formatDate, formatMoney, uatPath } from "@/components/finance/finance-format";
import { useLanguage } from "@/components/LanguageContext";

export default function PaymentSlipsPage() {
  const { lang } = useLanguage();
  const t = (th: string, en: string) => (lang === "th" ? th : en);

  const [slips, setSlips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedSlip, setSelected] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form states
  const [payerName, setPayerName] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [amount, setAmount] = useState("");
  const [txDateTime, setTxDateTime] = useState("");
  const [bankRefId, setBankRefId] = useState("");
  const [promptpayRefId, setPromptpayRefId] = useState("");
  const [processingStatus, setProcessingStatus] = useState("");

  // Image controls
  const [imgZoom, setImgZoom] = useState(1);
  const [imgRotate, setImgRotate] = useState(0);

  async function loadSlips() {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (statusFilter !== "all") params.set("status", statusFilter);

    try {
      const res = await fetch(uatPath(`/api/finance/payment-slips?${params.toString()}`), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load payment slips");
      setSlips(data.payment_slips || []);
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(loadSlips, 250);
    return () => clearTimeout(timer);
  }, [q, statusFilter]);

  const handleSelectSlip = (slip: any) => {
    setSelected(slip);
    setIsEditing(false);
    setIsDeleting(false);
    setImgZoom(1);
    setImgRotate(0);

    // Populate form
    setPayerName(slip.payer_name_raw || "");
    setPayeeName(slip.payee_name_raw || "");
    setAmount(slip.amount ? parseFloat(String(slip.amount)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
    // Format timestamp for datetime-local input
    if (slip.transaction_at) {
      const d = new Date(slip.transaction_at);
      const tzOffset = d.getTimezoneOffset() * 60000;
      const localISOTime = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
      setTxDateTime(localISOTime);
    } else {
      setTxDateTime("");
    }
    setBankRefId(slip.bank_ref_id || "");
    setPromptpayRefId(slip.promptpay_ref_id || "");
    setProcessingStatus(slip.processing_status || "verified");
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlip) return;
    setSaving(true);
    setMessage("");
    setSuccess("");

    try {
      const res = await fetch(uatPath("/api/finance/payment-slips"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedSlip.id,
          payer_name_raw: payerName,
          payee_name_raw: payeeName,
          amount: parseFloat(String(amount).replace(/,/g, "")),
          transaction_at: txDateTime ? new Date(txDateTime).toISOString() : null,
          bank_ref_id: bankRefId || null,
          promptpay_ref_id: promptpayRefId || null,
          processing_status: processingStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update payment slip");

      setSuccess(t("อัปเดตข้อมูลสลิปเรียบร้อยแล้ว", "Payment slip updated successfully"));
      setIsEditing(false);
      loadSlips();
      // Refresh current selection
      setSelected(data.payment_slip);
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedSlip) return;
    setSaving(true);
    setMessage("");
    setSuccess("");

    try {
      const res = await fetch(uatPath(`/api/finance/payment-slips?id=${selectedSlip.id}`), {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete payment slip");

      setSuccess(t("ลบสลิปเรียบร้อยแล้ว", "Payment slip deleted successfully"));
      setIsDeleting(false);
      setSelected(null);
      loadSlips();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <FinancePageHeader
        title={t("จัดการสลิปโอนเงิน", "Manage Payment Slips")}
        description={t("สแกน แก้ไข และลบข้อมูลสลิปที่รวบรวมจากไลน์บอท", "Edit, delete, and audit payment slips received from LINE channel")}
      />

      {success && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess("")} className="text-emerald-500 hover:text-emerald-700">✕</button>
        </div>
      )}

      {message && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage("")} className="text-red-500 hover:text-red-700">✕</button>
        </div>
      )}

      {/* Filter and Content Controls */}
      <div className="space-y-4">
          <div className="bg-white p-4 rounded-3xl border border-surface-200 shadow-sm flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400">🔍</span>
              <input
                type="text"
                placeholder={t("ค้นหาผู้โอน, เลขที่รายการ...", "Search payer, reference ID...")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-surface-50 border border-surface-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
            >
              <option value="all">{t("ทุกสถานะ", "All Statuses")}</option>
              <option value="verified">{t("ยืนยันแล้ว", "Verified")}</option>
              <option value="needs_review">{t("รอตรวจสอบ", "Needs Review")}</option>
              <option value="rejected">{t("ปฏิเสธ", "Rejected")}</option>
            </select>
          </div>

          <div className="bg-white rounded-3xl border border-surface-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-surface-500 space-y-3">
                <div className="animate-spin text-2xl">⏳</div>
                <div className="text-sm">{t("กำลังโหลดรายการ...", "Loading payment slips...")}</div>
              </div>
            ) : slips.length === 0 ? (
              <div className="p-12 text-center text-surface-400">
                <span className="text-4xl block mb-3">📄</span>
                <span className="text-sm">{t("ไม่พบสลิปโอนเงินในระบบ", "No payment slips found")}</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-surface-50 border-b border-surface-200 text-surface-600 font-medium">
                      <th className="px-6 py-4">{t("ข้อมูลผู้โอน / วันเวลา", "Payer / Date")}</th>
                      <th className="px-6 py-4 text-right">{t("ยอดเงิน", "Amount")}</th>
                      <th className="px-6 py-4">{t("เลขอ้างอิง", "Ref ID")}</th>
                      <th className="px-6 py-4 text-center">{t("สถานะ", "Status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {slips.map((slip) => {
                      const active = selectedSlip?.id === slip.id;
                      return (
                        <Fragment key={slip.id}>
                        <tr
                          onClick={() => {
                            if (active) {
                              setSelected(null);
                            } else {
                              handleSelectSlip(slip);
                            }
                          }}
                          className={`hover:bg-surface-50 transition-colors cursor-pointer ${
                            active ? "bg-brand-50/40 hover:bg-brand-50/50" : ""
                          }`}
                        >
                          <td className="px-6 py-4">
                            <div className="font-semibold text-surface-800 break-words max-w-[200px]">
                              {slip.payer_name_raw || t("- ไม่ระบุ -", "Anonymous")}
                            </div>
                            <div className="text-xs text-surface-500 mt-1">
                              {slip.transaction_at ? formatDate(slip.transaction_at, lang) : t("ไม่มีระบุวันเวลา", "No transaction time")}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-surface-900">
                            {formatMoney(slip.amount, lang)}
                          </td>
                          <td className="px-6 py-4 text-surface-600 font-mono text-xs">
                            {slip.bank_ref_id || slip.promptpay_ref_id || t("- ไม่มี -", "No ref")}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <FinanceStatusBadge status={slip.processing_status} lang={lang} />
                          </td>
                        </tr>
                        {active && (
                          <tr className="bg-surface-50/70 border-b border-surface-200" onClick={(e) => e.stopPropagation()}>
                            <td colSpan={4} className="px-6 py-6">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-3xl border border-surface-200 shadow-inner">
                                {/* Left: Image Canvas */}
                                <div className="flex flex-col gap-3">
                                  <div className="relative border border-surface-200 rounded-2xl overflow-hidden bg-surface-950 aspect-[3/4] flex items-center justify-center min-h-[300px] max-h-[440px]">
                                    <img
                                      src={uatPath(`/api/finance/payment-slips/file?id=${slip.id}`)}
                                      alt="Payment Slip Evidence"
                                      style={{
                                        transform: `scale(${imgZoom}) rotate(${imgRotate}deg)`,
                                        transition: "transform 150ms ease",
                                      }}
                                      className="max-h-full max-w-full object-contain pointer-events-none"
                                    />
                                    {/* Image Controls Overlay */}
                                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full ring-1 ring-white/10">
                                      <button
                                        type="button"
                                        onClick={() => setImgZoom((z) => Math.max(0.5, z - 0.25))}
                                        className="text-white hover:text-brand-300 text-xs font-bold px-2 py-0.5"
                                      >
                                        ➖
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setImgZoom(1)}
                                        className="text-white hover:text-brand-300 text-xs font-bold px-2 py-0.5"
                                      >
                                        1:1
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setImgZoom((z) => Math.min(3, z + 0.25))}
                                        className="text-white hover:text-brand-300 text-xs font-bold px-2 py-0.5"
                                      >
                                        ➕
                                      </button>
                                      <span className="w-px h-3 bg-white/20" />
                                      <button
                                        type="button"
                                        onClick={() => setImgRotate((r) => (r + 90) % 360)}
                                        className="text-white hover:text-brand-300 text-xs font-bold px-2 py-0.5"
                                      >
                                        🔄
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {/* Right: Form / details */}
                                <div className="flex flex-col justify-between">
                                  {!isEditing && !isDeleting ? (
                                    <div className="space-y-4">
                                      {/* View mode details */}
                                      <div className="space-y-3 border-b border-surface-100 pb-5">
                                        <div className="grid grid-cols-2 gap-4">
                                          <div>
                                            <div className="text-xs text-surface-400 mb-0.5">{t("ผู้โอนเงิน", "Payer Name")}</div>
                                            <div className="text-sm font-semibold text-surface-800 break-words">{slip.payer_name_raw || "-"}</div>
                                          </div>
                                          <div>
                                            <div className="text-xs text-surface-400 mb-0.5">{t("ผู้รับเงิน", "Payee Name")}</div>
                                            <div className="text-sm font-semibold text-surface-800 break-words">{slip.payee_name_raw || "-"}</div>
                                          </div>
                                        </div>
                                        <div>
                                          <div className="text-xs text-surface-400 mb-0.5">{t("จำนวนเงิน", "Amount")}</div>
                                          <div className="text-sm font-bold text-surface-900 text-lg">
                                            {formatMoney(slip.amount, lang)}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="text-xs text-surface-400 mb-0.5">{t("วันและเวลาที่ทำรายการ", "Transaction Date & Time")}</div>
                                          <div className="text-sm font-semibold text-surface-800">
                                            {slip.transaction_at ? formatDate(slip.transaction_at, lang) : "-"}
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                          <div>
                                            <div className="text-xs text-surface-400 mb-0.5">{t("เลขอ้างอิงธนาคาร", "Bank Ref ID")}</div>
                                            <div className="text-xs font-mono font-medium text-surface-800 break-all">{slip.bank_ref_id || "-"}</div>
                                          </div>
                                          <div>
                                            <div className="text-xs text-surface-400 mb-0.5">{t("เลข PromptPay", "PromptPay Ref ID")}</div>
                                            <div className="text-xs font-mono font-medium text-surface-800 break-all">{slip.promptpay_ref_id || "-"}</div>
                                          </div>
                                        </div>
                                        <div>
                                          <div className="text-xs text-surface-400 mb-1">{t("สถานะสลิป", "Status")}</div>
                                          <FinanceStatusBadge status={slip.processing_status} lang={lang} />
                                        </div>
                                      </div>

                                      <div className="flex gap-3 pt-2">
                                        <button
                                          type="button"
                                          onClick={() => setIsEditing(true)}
                                          className="flex-1 py-2.5 border border-brand-200 text-brand-700 bg-brand-50/60 hover:bg-brand-50 font-semibold rounded-2xl text-sm transition-all"
                                        >
                                          ✏️ {t("แก้ไขสลิป", "Edit Slip")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setIsDeleting(true)}
                                          className="flex-1 py-2.5 border border-red-200 text-red-700 bg-red-50/60 hover:bg-red-50 font-semibold rounded-2xl text-sm transition-all"
                                        >
                                          🗑️ {t("ลบข้อมูล", "Delete Slip")}
                                        </button>
                                      </div>
                                    </div>
                                  ) : isEditing ? (
                                    <form onSubmit={handleUpdate} className="space-y-4">
                                      {/* Edit Form Fields */}
                                      <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-4">
                                          <div>
                                            <label className="block text-xs font-medium text-surface-500 mb-1">{t("ผู้โอนเงิน", "Payer Name")}</label>
                                            <input
                                              type="text"
                                              required
                                              value={payerName}
                                              onChange={(e) => setPayerName(e.target.value)}
                                              className="w-full px-3.5 py-2 bg-surface-50 border border-surface-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-semibold"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-xs font-medium text-surface-500 mb-1">{t("ผู้รับเงิน", "Payee Name")}</label>
                                            <input
                                              type="text"
                                              required
                                              value={payeeName}
                                              onChange={(e) => setPayeeName(e.target.value)}
                                              className="w-full px-3.5 py-2 bg-surface-50 border border-surface-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-semibold"
                                            />
                                          </div>
                                        </div>
                                        <div>
                                          <label className="block text-xs font-medium text-surface-500 mb-1">{t("จำนวนเงิน (บาท)", "Amount (THB)")}</label>
                                          <input
                                            type="text"
                                            required
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            onFocus={() => setAmount(String(amount).replace(/,/g, ""))}
                                            onBlur={() => {
                                              const num = parseFloat(String(amount).replace(/,/g, ""));
                                              if (!isNaN(num)) {
                                                setAmount(num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                                              }
                                            }}
                                            className="w-full px-3.5 py-2 bg-surface-50 border border-surface-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-bold text-lg"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-medium text-surface-500 mb-1">{t("วันและเวลาที่ทำรายการ", "Transaction Date & Time")}</label>
                                          <input
                                            type="datetime-local"
                                            required
                                            value={txDateTime}
                                            onChange={(e) => setTxDateTime(e.target.value)}
                                            className="w-full px-3.5 py-2 bg-surface-50 border border-surface-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-semibold"
                                          />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                          <div>
                                            <label className="block text-xs font-medium text-surface-500 mb-1">{t("เลขอ้างอิงธนาคาร", "Bank Ref ID")}</label>
                                            <input
                                              type="text"
                                              value={bankRefId}
                                              onChange={(e) => setBankRefId(e.target.value)}
                                              className="w-full px-3.5 py-2 bg-surface-50 border border-surface-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-mono text-xs"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-xs font-medium text-surface-500 mb-1">{t("เลข PromptPay", "PromptPay Ref ID")}</label>
                                            <input
                                              type="text"
                                              value={promptpayRefId}
                                              onChange={(e) => setPromptpayRefId(e.target.value)}
                                              className="w-full px-3.5 py-2 bg-surface-50 border border-surface-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-mono text-xs"
                                            />
                                          </div>
                                        </div>
                                        <div>
                                          <label className="block text-xs font-medium text-surface-500 mb-1">{t("สถานะ", "Status")}</label>
                                          <select
                                            value={processingStatus}
                                            onChange={(e) => setProcessingStatus(e.target.value)}
                                            className="w-full px-3.5 py-2 bg-surface-50 border border-surface-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
                                          >
                                            <option value="verified">{t("ยืนยันแล้ว / ถูกต้อง", "Verified")}</option>
                                            <option value="needs_review">{t("รอตรวจสอบ", "Needs Review")}</option>
                                            <option value="rejected">{t("ปฏิเสธ / ไม่ผ่าน", "Rejected")}</option>
                                          </select>
                                        </div>
                                      </div>

                                      <div className="flex gap-3 pt-3">
                                        <button
                                          type="submit"
                                          disabled={saving}
                                          className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-2xl text-sm transition-all shadow-md shadow-brand-100 flex items-center justify-center gap-1.5"
                                        >
                                          {saving ? "⏳" : "💾"} {t("บันทึกการแก้ไข", "Save Changes")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setIsEditing(false)}
                                          className="px-5 py-2.5 border border-surface-200 text-surface-700 bg-white hover:bg-surface-50 font-semibold rounded-2xl text-sm transition-all"
                                        >
                                          {t("ยกเลิก", "Cancel")}
                                        </button>
                                      </div>
                                    </form>
                                  ) : (
                                    <div className="space-y-4">
                                      {/* Delete Confirmation */}
                                      <div className="bg-red-50 border border-red-200 p-4 rounded-2xl text-red-800 text-sm space-y-2">
                                        <span className="font-bold block">⚠️ {t("ยืนยันการลบสลิปนี้?", "Confirm Deletion?")}</span>
                                        <span className="text-xs leading-relaxed">
                                          {t(
                                            "เมื่อทำการลบแล้วข้อมูลนี้จะถูกทำเครื่องหมายว่าลบออก (Soft-Delete) และลบสถิติธุรกรรมออกจากระบบ อย่างไรก็ตาม รายการบันทึกการกระทำนี้จะถูกเก็บไว้เป็นประวัติการลบ (Audit Log) ในฐานข้อมูล",
                                            "Soft-deleting this payment slip will mark it as deleted and update statistics. An audit log record will remain in the database."
                                          )}
                                        </span>
                                      </div>

                                      <div className="flex gap-3 pt-2">
                                        <button
                                          type="button"
                                          disabled={saving}
                                          onClick={handleDelete}
                                          className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl text-sm transition-all shadow-md shadow-red-100 flex items-center justify-center gap-1.5"
                                        >
                                          {saving ? "⏳" : "🗑️"} {t("ยืนยันการลบ", "Confirm Delete")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setIsDeleting(false)}
                                          className="px-5 py-2.5 border border-surface-200 text-surface-700 bg-white hover:bg-surface-50 font-semibold rounded-2xl text-sm transition-all"
                                        >
                                          {t("ยกเลิก", "Cancel")}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
  );
}
