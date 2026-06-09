"use client";

import { useEffect, useMemo, useState } from "react";
import FinancePageHeader from "@/components/finance/FinancePageHeader";
import FinanceTabs from "@/components/finance/FinanceTabs";
import FinanceStatusBadge from "@/components/finance/FinanceStatusBadge";
import KpiCard from "@/components/finance/KpiCard";
import { formatDate, formatMoney, numberValue, uatPath } from "@/components/finance/finance-format";
import { useLanguage } from "@/components/LanguageContext";

type ExpenseItemInput = { description: string; category: string; amount: string; payment_source: string; spent_at: string };

export default function ExpensesPage() {
  const { lang } = useLanguage();
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const [tab, setTab] = useState("requests");
  const [requests, setRequests] = useState<any[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [approvalAction, setApprovalAction] = useState<"approved" | "rejected" | "paid" | "cancelled" | null>(null);
  const [items, setItems] = useState<ExpenseItemInput[]>([{ description: "", category: "", amount: "", payment_source: "bank_transfer", spent_at: "" }]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  async function loadExpenses() {
    setLoading(true); setMessage("");
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    try {
      const res = await fetch(uatPath(`/api/finance/expenses?${params.toString()}`), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load expenses");
      setRequests(data.requests || []); setStats(data.stats || []); setBalances(data.petty_cash_balances || []); setLedger(data.petty_cash_ledger || []);
    } catch (err: any) { setMessage(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { const timer = window.setTimeout(loadExpenses, 250); return () => window.clearTimeout(timer); }, [status, q]);

  const summary = useMemo(() => ({
    pending: stats.find((s) => s.status === "pending")?.count || 0,
    approved: stats.find((s) => s.status === "approved")?.total_approved || 0,
    paid: stats.find((s) => s.status === "paid")?.total_approved || 0,
    petty: balances.reduce((sum, b) => sum + numberValue(b.current_balance), 0),
  }), [stats, balances]);

  function updateItem(index: number, key: keyof ExpenseItemInput, value: string) {
    setItems((prev) => prev.map((it, i) => i === index ? { ...it, [key]: value } : it));
  }

  async function handleSubmitExpense(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true); setMessage(""); setSuccess("");
    try {
      const payload = { 
        title, 
        description, 
        items: items.filter((it) => it.description && it.category && it.amount)
      };
      
      const url = editingId 
        ? `/api/finance/expenses/${editingId}`
        : "/api/finance/expenses";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(uatPath(url), { 
        method, 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify(payload) 
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      
      setSuccess(editingId 
        ? t("แก้ไขคำขอเบิกเรียบร้อย", "Expense request updated") 
        : t("ส่งคำขอเบิกเรียบร้อย", "Expense request submitted")
      );
      
      setTitle("");
      setDescription("");
      setItems([{ description: "", category: "", amount: "", payment_source: "bank_transfer", spent_at: "" }]); 
      setOpenForm(false); 
      setEditingId(null);
      await loadExpenses();
    } catch (err: any) { setMessage(err.message); } finally { setSaving(false); }
  }

  async function handleDeleteExpense(requestId: string) {
    if (!confirm(t("ยืนยันต้องการลบคำขอเบิกนี้?", "Confirm delete this expense request?"))) return;
    setSaving(true); setMessage(""); setSuccess("");
    try {
      const res = await fetch(uatPath(`/api/finance/expenses/${requestId}`), { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setSuccess(t("ลบคำขอเบิกเรียบร้อย", "Expense request deleted"));
      setSelected(null);
      await loadExpenses();
    } catch (err: any) { setMessage(err.message); } finally { setSaving(false); }
  }

  const handleEditClick = (r: any) => {
    setEditingId(r.id);
    setTitle(r.title);
    setDescription(r.description || "");
    setItems(r.items.map((it: any) => ({
      id: it.id,
      description: it.description,
      category: it.category,
      amount: String(it.amount_requested),
      payment_source: it.payment_source,
      spent_at: it.spent_at || ""
    })));
    setOpenForm(true);
  };

  const handleNewRequestClick = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setItems([{ description: "", category: "", amount: "", payment_source: "bank_transfer", spent_at: "" }]);
    setOpenForm((v) => !v);
  };

  async function submitApproval(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || !approvalAction) return;
    if (approvalAction === "rejected" && !confirm(t("ยืนยันไม่อนุมัติคำขอนี้?", "Confirm reject this request?"))) return;
    const f = new FormData(e.currentTarget);
    setSaving(true); setMessage(""); setSuccess("");
    try {
      const payload: any = { action: approvalAction, total_approved: f.get("total_approved"), notes: f.get("notes") };
      const res = await fetch(uatPath(`/api/finance/expenses/${selected.id}/approval`), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approval failed");
      setSuccess(t("บันทึกสถานะรายจ่ายเรียบร้อย", "Expense status saved"));
      setApprovalAction(null); await loadExpenses();
    } catch (err: any) { setMessage(err.message); } finally { setSaving(false); }
  }

  async function submitPettySpend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!selected) return;
    const f = new FormData(e.currentTarget);
    setSaving(true); setMessage(""); setSuccess("");
    try {
      const payload = { amount: f.get("amount"), description: f.get("description"), transaction_date: f.get("transaction_date") };
      const res = await fetch(uatPath(`/api/finance/expenses/${selected.id}/petty-cash-spend`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Petty cash spend failed");
      setSuccess(t("บันทึกใช้เงินสดย่อยเรียบร้อย", "Petty cash spend recorded"));
      e.currentTarget.reset(); await loadExpenses();
    } catch (err: any) { setMessage(err.message); } finally { setSaving(false); }
  }

  return <div className="py-6 min-w-0">
    <FinancePageHeader title={t("รายจ่ายและคำขอเบิก", "Expenses")} description={t("สร้างคำขอเบิก อนุมัติรายจ่าย และติดตามเงินสดย่อย", "Create requests, approve expenses, and track petty cash")}>
      <button onClick={handleNewRequestClick} className="btn-primary w-full sm:w-auto">+ {t("ขอเบิกค่าใช้จ่าย", "New expense request")}</button>
    </FinancePageHeader>
    {message && <div className="mb-4 rounded-xl border px-4 py-3 text-sm bg-red-50 border-red-200 text-red-700">{message}</div>}
    {success && <div className="mb-4 rounded-xl border px-4 py-3 text-sm bg-brand-50 border-brand-100 text-brand-700">{success}</div>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6"><KpiCard label={t("รออนุมัติ", "Pending")} value={summary.pending} tone="amber" /><KpiCard label={t("ยอดอนุมัติ", "Approved")} value={formatMoney(summary.approved, lang)} tone="emerald" /><KpiCard label={t("จ่ายแล้ว", "Paid")} value={formatMoney(summary.paid, lang)} tone="blue" /><KpiCard label={t("เงินสดย่อย", "Petty cash")} value={formatMoney(summary.petty, lang)} /></div>
    <FinanceTabs tabs={[{ key: "requests", label: t("คำขอเบิก", "Requests") }, { key: "petty", label: t("เงินสดย่อย", "Petty Cash") }, { key: "ledger", label: t("ประวัติ", "Ledger") }]} active={tab} onChange={setTab} />

    {openForm && <div className="card mb-6"><div className="flex justify-between mb-4"><h2 className="font-semibold text-surface-900">{editingId ? t("แก้ไขคำขอเบิก", "Edit expense request") : t("สร้างคำขอเบิก", "Create expense request")}</h2><button onClick={() => setOpenForm(false)} className="text-surface-500">✕</button></div><form onSubmit={handleSubmitExpense} className="space-y-4"><div className="grid md:grid-cols-2 gap-3"><input name="title" value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" placeholder={t("หัวข้อ", "Title")} required /><input name="description" value={description} onChange={(e) => setDescription(e.target.value)} className="input-field" placeholder={t("รายละเอียด", "Description")} /></div>{items.map((it, index) => <div key={index} className="rounded-xl border border-surface-200 p-3 grid md:grid-cols-5 gap-3"><input className="input-field md:col-span-2" placeholder={t("รายการ", "Item description")} value={it.description} onChange={(e) => updateItem(index, "description", e.target.value)} required /><input className="input-field" placeholder={t("หมวดหมู่", "Category")} value={it.category} onChange={(e) => updateItem(index, "category", e.target.value)} required /><input className="input-field" placeholder={t("จำนวนเงิน", "Amount")} value={it.amount} onChange={(e) => updateItem(index, "amount", e.target.value)} required /><select className="input-field" value={it.payment_source} onChange={(e) => updateItem(index, "payment_source", e.target.value)}><option value="bank_transfer">{t("โอนธนาคาร", "Bank transfer")}</option><option value="petty_cash">{t("เงินสดย่อย", "Petty cash")}</option><option value="cash">{t("เงินสด", "Cash")}</option></select></div>)}<button type="button" onClick={() => setItems([...items, { description: "", category: "", amount: "", payment_source: "bank_transfer", spent_at: "" }])} className="px-4 py-2 rounded-xl border border-surface-200 text-sm">+ {t("เพิ่มรายการ", "Add item")}</button><button disabled={saving} className="btn-primary w-full">{saving ? t("กำลังบันทึก...", "Saving...") : (editingId ? t("บันทึกการแก้ไข", "Save changes") : t("ส่งคำขอ", "Submit request"))}</button></form></div>}

    {tab === "requests" && <><div className="card mb-4 grid md:grid-cols-3 gap-3"><input className="input-field md:col-span-2" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นหาเลขที่คำขอ/หัวข้อ", "Search request number/title")} /><select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">{t("ทุกสถานะ", "All statuses")}</option><option value="pending">{t("รออนุมัติ", "Pending")}</option><option value="approved">{t("อนุมัติแล้ว", "Approved")}</option><option value="paid">{t("จ่ายแล้ว", "Paid")}</option><option value="rejected">{t("ไม่อนุมัติ", "Rejected")}</option></select></div><div className="space-y-3">{loading ? <div className="text-center py-12 text-surface-500">{t("กำลังโหลด...", "Loading...")}</div> : requests.length === 0 ? <div className="card text-center text-surface-500">{t("ยังไม่มีคำขอเบิก", "No expense requests yet")}</div> : requests.map((r) => <div key={r.id} className="bg-white rounded-2xl border border-surface-200 shadow-sm p-4"><div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3"><button onClick={() => setSelected(selected?.id === r.id ? null : r)} className="text-left min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-surface-900">{r.request_number}</span><FinanceStatusBadge status={r.status} lang={lang} /></div><div className="mt-1 text-sm text-surface-700 break-words">{r.title}</div><div className="text-xs text-surface-500">{formatDate(r.requested_at, lang)} · {r.requester_name || r.requester_email || "-"}</div></button><div className="grid grid-cols-2 gap-3 lg:text-right"><div><div className="text-xs text-surface-500">{t("ยอดขอ", "Requested")}</div><div className="font-semibold">{formatMoney(r.total_requested, lang)}</div></div><div><div className="text-xs text-surface-500">{t("ยอดอนุมัติ", "Approved")}</div><div className="font-semibold">{formatMoney(r.total_approved, lang)}</div></div></div></div>{selected?.id === r.id && <div className="mt-4 border-t border-surface-100 pt-4"><div className="grid lg:grid-cols-2 gap-4"><div><h3 className="font-medium mb-2">{t("รายการย่อย", "Items")}</h3><div className="space-y-2">{(r.items || []).map((it: any) => <div key={it.id} className="rounded-xl bg-surface-50 p-3 text-sm"><div className="font-medium break-words">{it.description}</div><div className="text-surface-500">{it.category} · {formatMoney(it.amount_requested, lang)}</div></div>)}</div></div><div><h3 className="font-medium mb-2">{t("ประวัติอนุมัติ", "Approval timeline")}</h3><div className="space-y-2">{(r.approval_logs || []).map((log: any) => <div key={log.id} className="text-sm border-l-2 border-brand-200 pl-3"><div className="font-medium">{log.action}</div><div className="text-surface-500">{formatDate(log.created_at, lang)} {log.notes ? `· ${log.notes}` : ""}</div></div>)}</div></div></div><div className="mt-4 flex flex-wrap gap-2">{r.status === "pending" && <><button onClick={() => setApprovalAction("approved")} className="px-4 py-2 rounded-xl bg-brand-500 text-white text-sm">{t("อนุมัติ", "Approve")}</button><button onClick={() => setApprovalAction("rejected")} className="px-4 py-2 rounded-xl bg-red-50 text-red-700 text-sm">{t("ไม่อนุมัติ", "Reject")}</button><button onClick={() => handleEditClick(r)} className="px-4 py-2 rounded-xl border border-surface-200 text-surface-700 text-sm font-semibold hover:bg-surface-50">{t("✏️ แก้ไข", "✏️ Edit")}</button><button onClick={() => handleDeleteExpense(r.id)} className="px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-100/60">{t("🗑️ ลบ", "🗑️ Delete")}</button></>}{r.status === "approved" && <><button onClick={() => setApprovalAction("paid")} className="px-4 py-2 rounded-xl bg-blue-50 text-blue-700 text-sm">{t("จ่ายแล้ว", "Mark paid")}</button><button onClick={() => setApprovalAction(null)} className="px-4 py-2 rounded-xl bg-amber-50 text-amber-700 text-sm">{t("ใช้เงินสดย่อย", "Petty cash spend")}</button></>}</div>{approvalAction && <form onSubmit={submitApproval} className="mt-4 grid md:grid-cols-3 gap-3"><input name="total_approved" defaultValue={r.total_requested} className="input-field" placeholder={t("ยอดอนุมัติ", "Approved amount")} /><input name="notes" className="input-field md:col-span-2" placeholder={t("หมายเหตุ", "Notes")} /><button disabled={saving} className="btn-primary md:col-span-3">{saving ? t("กำลังบันทึก...", "Saving...") : t("ยืนยัน", "Confirm")}</button></form>} {r.status === "approved" && <form onSubmit={submitPettySpend} className="mt-4 grid md:grid-cols-3 gap-3"><input name="amount" className="input-field" placeholder={t("จำนวนเงินสดย่อย", "Petty cash amount")} /><input name="description" className="input-field" placeholder={t("รายละเอียด", "Description")} /><input name="transaction_date" type="date" className="input-field" /><button disabled={saving} className="btn-primary md:col-span-3">{t("บันทึกใช้เงินสดย่อย", "Record petty cash spend")}</button></form>}</div>}</div>)}</div></>}
    {tab === "petty" && <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">{balances.map((b) => <div key={b.manager_user_id} className="card"><div className="text-sm text-surface-500">{b.manager_name || t("ผู้จัดการ", "Manager")}</div><div className="mt-2 text-2xl font-bold text-brand-700">{formatMoney(b.current_balance, lang)}</div><div className="text-xs text-surface-500">{t("อัปเดตล่าสุด", "Last updated")}: {formatDate(b.last_transaction_at, lang)}</div></div>)}{balances.length === 0 && <div className="card text-center text-surface-500 md:col-span-2">{t("ยังไม่มีเงินสดย่อย", "No petty cash balances")}</div>}</div>}
    {tab === "ledger" && <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden"><div className="overflow-x-auto no-scrollbar"><table className="min-w-full text-sm"><thead className="bg-surface-50 text-surface-500"><tr><th className="p-3 text-left">{t("วันที่", "Date")}</th><th className="p-3 text-left">{t("ผู้จัดการ", "Manager")}</th><th className="p-3 text-left">{t("ประเภท", "Type")}</th><th className="p-3 text-right">{t("จำนวนเงิน", "Amount")}</th><th className="p-3 text-right">{t("คงเหลือ", "Balance")}</th></tr></thead><tbody>{ledger.map((l) => <tr key={l.id} className="border-t border-surface-100"><td className="p-3">{formatDate(l.transaction_date, lang)}</td><td className="p-3">{l.manager_name || "-"}</td><td className="p-3">{l.transaction_type}</td><td className="p-3 text-right">{formatMoney(l.amount, lang)}</td><td className="p-3 text-right">{formatMoney(l.balance_after, lang)}</td></tr>)}</tbody></table></div></div>}
  </div>;
}
