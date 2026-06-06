"use client";

import { useEffect, useMemo, useState } from "react";
import FinancePageHeader from "@/components/finance/FinancePageHeader";
import KpiCard from "@/components/finance/KpiCard";
import FinanceStatusBadge from "@/components/finance/FinanceStatusBadge";
import { formatDate, formatMoney, numberValue, uatPath } from "@/components/finance/finance-format";
import { useLanguage } from "@/components/LanguageContext";

type FormMode = "payment" | "member" | "fee" | null;

export default function RevenuePage() {
  const { lang } = useLanguage();
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [mode, setMode] = useState<FormMode>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [filters, setFilters] = useState({ q: "", status: "all", payment_type: "all", from: "", to: "" });

  async function loadRevenue() {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v && v !== "all") params.set(k, v); });
    try {
      const res = await fetch(uatPath(`/api/finance/revenue?${params.toString()}`), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load revenue");
      setRows(data.revenue || []);
      setStats(data.stats || []);
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { const timer = window.setTimeout(loadRevenue, 250); return () => window.clearTimeout(timer); }, [filters]);

  const totals = useMemo(() => {
    const byStatus: Record<string, any> = {};
    stats.forEach((s) => { byStatus[s.status] = s; });
    return {
      pending: byStatus.pending || {},
      overdue: byStatus.overdue || {},
      paid: byStatus.paid || {},
      totalCount: stats.reduce((sum, s) => sum + numberValue(s.count), 0),
    };
  }, [stats]);

  function openPayment(row?: any) { setSelected(row || null); setMode("payment"); setSuccess(""); setMessage(""); }

  async function submit(e: React.FormEvent<HTMLFormElement>, action: "member" | "maintenance_fee" | "payment") {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const payload: any = { action };
    f.forEach((value, key) => { if (String(value).trim()) payload[key] = value; });
    if (action === "payment" && selected) {
      payload.member_id ||= selected.member_id;
      payload.maintenance_fee_id ||= selected.id;
      payload.amount_paid ||= selected.amount_due;
      payload.payment_type ||= selected.payment_frequency;
    }
    setSaving(true); setMessage(""); setSuccess("");
    try {
      const res = await fetch(uatPath("/api/finance/revenue"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSuccess(t("บันทึกข้อมูลรายรับเรียบร้อย", "Revenue information saved"));
      formEl.reset(); setMode(null); setSelected(null); await loadRevenue();
    } catch (err: any) { setMessage(err.message); } finally { setSaving(false); }
  }

  return (
    <div className="py-6 min-w-0">
      <FinancePageHeader title={t("รายรับค่าส่วนกลาง", "Revenue")} description={t("ติดตามค่าส่วนกลาง รายการค้างชำระ และบันทึกการชำระเงิน", "Track maintenance fees, outstanding balances, and payment records")}>
        <button onClick={() => openPayment()} className="btn-primary w-full sm:w-auto">+ {t("บันทึกชำระเงิน", "Record payment")}</button>
        <button onClick={() => setMode("member")} className="px-4 py-2 rounded-xl border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50">+ {t("สมาชิก", "Member")}</button>
        <button onClick={() => setMode("fee")} className="px-4 py-2 rounded-xl border border-surface-200 bg-white text-sm font-medium text-surface-700 hover:bg-surface-50">+ {t("รอบค่าส่วนกลาง", "Fee")}</button>
      </FinancePageHeader>

      {message && <div className="mb-4 rounded-xl border px-4 py-3 text-sm bg-red-50 border-red-200 text-red-700">{message}</div>}
      {success && <div className="mb-4 rounded-xl border px-4 py-3 text-sm bg-brand-50 border-brand-100 text-brand-700">{success}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label={t("รอชำระ", "Pending")} value={totals.pending.count || 0} hint={formatMoney(totals.pending.total_due, lang)} tone="amber" />
        <KpiCard label={t("เกินกำหนด", "Overdue")} value={totals.overdue.count || 0} hint={formatMoney(totals.overdue.total_due, lang)} tone="red" />
        <KpiCard label={t("ชำระแล้ว", "Paid")} value={totals.paid.count || 0} hint={formatMoney(totals.paid.total_due, lang)} tone="emerald" />
        <KpiCard label={t("รวมรายการ", "Total")} value={totals.totalCount} hint={t("ทุกรอบค่าส่วนกลาง", "All fee periods")} />
      </div>

      <div className="card mb-6">
        <div className="grid md:grid-cols-5 gap-3">
          <input className="input-field md:col-span-2" placeholder={t("ค้นหาบ้าน/เจ้าของ", "Search house or owner")} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <select className="input-field" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="all">{t("ทุกสถานะ", "All statuses")}</option><option value="pending">{t("รอชำระ", "Pending")}</option><option value="overdue">{t("เกินกำหนด", "Overdue")}</option><option value="paid">{t("ชำระแล้ว", "Paid")}</option></select>
          <select className="input-field" value={filters.payment_type} onChange={(e) => setFilters({ ...filters, payment_type: e.target.value })}><option value="all">{t("ทุกประเภท", "All types")}</option><option value="monthly">{t("รายเดือน", "Monthly")}</option><option value="3_months">3 {t("เดือน", "months")}</option><option value="6_months">6 {t("เดือน", "months")}</option><option value="yearly">{t("รายปี", "Yearly")}</option></select>
          <button className="px-4 py-2 rounded-xl bg-surface-100 text-sm" onClick={() => setFilters({ q: "", status: "all", payment_type: "all", from: "", to: "" })}>{t("ล้าง", "Clear")}</button>
        </div>
      </div>

      {mode && <div className="card mb-6">
        <div className="flex items-center justify-between mb-4"><h2 className="font-semibold text-surface-900">{mode === "payment" ? t("บันทึกการชำระเงิน", "Record payment") : mode === "member" ? t("เพิ่มสมาชิก", "Add member") : t("เพิ่มรอบค่าส่วนกลาง", "Add maintenance fee")}</h2><button onClick={() => setMode(null)} className="text-sm text-surface-500 hover:text-surface-800">✕</button></div>
        {mode === "payment" && <form onSubmit={(e) => submit(e, "payment")} className="grid md:grid-cols-3 gap-3"><input name="member_id" defaultValue={selected?.member_id || ""} className="input-field" placeholder="member_id" required={!selected} /><input name="maintenance_fee_id" defaultValue={selected?.id || ""} className="input-field" placeholder="maintenance_fee_id" /><input name="amount_paid" defaultValue={selected?.amount_due || ""} className="input-field" placeholder={t("จำนวนเงิน", "Amount")} required /><select name="payment_type" defaultValue={selected?.payment_frequency || "monthly"} className="input-field"><option value="monthly">{t("รายเดือน", "Monthly")}</option><option value="3_months">3 {t("เดือน", "months")}</option><option value="6_months">6 {t("เดือน", "months")}</option><option value="yearly">{t("รายปี", "Yearly")}</option></select><input name="payment_date" type="date" className="input-field" required /><input name="receipt_number" className="input-field" placeholder={t("เลขที่ใบเสร็จ", "Receipt no.")} /><textarea name="notes" className="input-field md:col-span-3" placeholder={t("หมายเหตุ", "Notes")} /><button disabled={saving} className="btn-primary md:col-span-3">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button></form>}
        {mode === "member" && <form onSubmit={(e) => submit(e, "member")} className="grid md:grid-cols-2 gap-3"><input name="house_number" className="input-field" placeholder={t("บ้านเลขที่", "House number")} required /><input name="owner_name" className="input-field" placeholder={t("ชื่อเจ้าของ", "Owner name")} required /><textarea name="notes" className="input-field md:col-span-2" placeholder={t("หมายเหตุ", "Notes")} /><button disabled={saving} className="btn-primary md:col-span-2">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button></form>}
        {mode === "fee" && <form onSubmit={(e) => submit(e, "maintenance_fee")} className="grid md:grid-cols-3 gap-3"><input name="member_id" className="input-field" placeholder="member_id" required /><input name="period_start" type="date" className="input-field" required /><input name="period_end" type="date" className="input-field" required /><input name="due_date" type="date" className="input-field" required /><input name="amount_due" className="input-field" placeholder={t("ยอดเรียกเก็บ", "Amount due")} required /><select name="payment_frequency" className="input-field"><option value="monthly">{t("รายเดือน", "Monthly")}</option><option value="3_months">3 {t("เดือน", "months")}</option><option value="6_months">6 {t("เดือน", "months")}</option><option value="yearly">{t("รายปี", "Yearly")}</option></select><button disabled={saving} className="btn-primary md:col-span-3">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button></form>}
      </div>}

      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        {loading ? <div className="text-center py-12 text-surface-500">{t("กำลังโหลด...", "Loading...")}</div> : rows.length === 0 ? <div className="text-center py-12 text-surface-500">{t("ยังไม่มีรายการรายรับ", "No revenue records yet")}</div> : <>
          <div className="hidden lg:block overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-surface-50 text-surface-500"><tr><th className="p-3 text-left">{t("บ้าน", "House")}</th><th className="p-3 text-left">{t("เจ้าของ", "Owner")}</th><th className="p-3 text-left">{t("รอบบิล", "Period")}</th><th className="p-3 text-right">{t("ยอดเรียกเก็บ", "Due")}</th><th className="p-3 text-right">{t("ชำระแล้ว", "Paid")}</th><th className="p-3 text-left">{t("สถานะ", "Status")}</th><th className="p-3"></th></tr></thead><tbody>{rows.map((r) => <tr key={r.id} className="border-t border-surface-100 hover:bg-surface-50"><td className="p-3 font-medium">{r.house_number}</td><td className="p-3">{r.owner_name || "-"}</td><td className="p-3">{formatDate(r.period_start, lang)} - {formatDate(r.period_end, lang)}</td><td className="p-3 text-right tabular-nums">{formatMoney(r.amount_due, lang)}</td><td className="p-3 text-right tabular-nums">{formatMoney(r.amount_paid, lang)}</td><td className="p-3"><FinanceStatusBadge status={r.effective_status || r.status} lang={lang} /></td><td className="p-3 text-right"><button onClick={() => openPayment(r)} className="text-brand-600 font-medium hover:underline">{t("บันทึกชำระ", "Record")}</button></td></tr>)}</tbody></table></div>
          <div className="lg:hidden divide-y divide-surface-100">{rows.map((r) => <div key={r.id} className="p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-semibold text-surface-900">{t("บ้าน", "House")} {r.house_number}</div><div className="text-sm text-surface-500 break-words">{r.owner_name || "-"}</div></div><FinanceStatusBadge status={r.effective_status || r.status} lang={lang} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><span className="text-surface-500">{t("ยอด", "Due")}</span><div className="font-semibold">{formatMoney(r.amount_due, lang)}</div></div><div><span className="text-surface-500">{t("ชำระ", "Paid")}</span><div className="font-semibold">{formatMoney(r.amount_paid, lang)}</div></div></div><button onClick={() => openPayment(r)} className="mt-3 w-full rounded-xl bg-brand-50 text-brand-700 py-2 text-sm font-medium">{t("บันทึกชำระ", "Record payment")}</button></div>)}</div>
        </>}
      </div>
    </div>
  );
}
