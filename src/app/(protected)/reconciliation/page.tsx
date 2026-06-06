"use client";

import { useEffect, useMemo, useState } from "react";
import FinancePageHeader from "@/components/finance/FinancePageHeader";
import FinanceTabs from "@/components/finance/FinanceTabs";
import FinanceStatusBadge from "@/components/finance/FinanceStatusBadge";
import KpiCard from "@/components/finance/KpiCard";
import { formatDate, formatMoney, numberValue, uatPath } from "@/components/finance/finance-format";
import { useLanguage } from "@/components/LanguageContext";

export default function ReconciliationPage() {
  const { lang } = useLanguage();
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const [view, setView] = useState("unreconciled");
  const [statements, setStatements] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [candidateType, setCandidateType] = useState("payment");
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
  const [matchAmount, setMatchAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  async function loadData() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(uatPath(`/api/finance/reconciliation${view === "all" ? "?unreconciled=false" : ""}`), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load reconciliation");
      const sorted = [...(data.statements || [])].sort((a, b) => Number(a.is_reconciled) - Number(b.is_reconciled));
      setStatements(sorted);
      setCandidates(data.candidates || []);
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [view]);

  const summary = useMemo(() => ({
    unreconciledCount: statements.filter((s) => !s.is_reconciled).length,
    unreconciledAmount: statements.reduce((sum, s) => sum + Math.abs(numberValue(s.unreconciled_amount || (!s.is_reconciled ? s.statement_amount : 0))), 0),
    reconciledCount: statements.filter((s) => s.is_reconciled).length,
    candidateCount: candidates.length,
  }), [statements, candidates]);

  async function addStatement(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const payload: any = { action: "statement" };
    f.forEach((value, key) => { if (String(value).trim()) payload[key] = value; });
    if (numberValue(payload.deposit) > 0 && numberValue(payload.withdraw) > 0) {
      setMessage(t("ฝากเข้าและถอนออกห้ามมีค่าพร้อมกัน", "Deposit and withdraw cannot both be positive"));
      return;
    }
    setSaving(true);
    setMessage("");
    setSuccess("");
    try {
      const res = await fetch(uatPath("/api/finance/reconciliation"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSuccess(t("เพิ่มรายการเดินบัญชีเรียบร้อย", "Statement added"));
      formEl.reset();
      setAddOpen(false);
      await loadData();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitSplit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || !selectedCandidate) return;
    setSaving(true);
    setMessage("");
    setSuccess("");
    try {
      const res = await fetch(uatPath("/api/finance/reconciliation"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "split",
          bank_statement_line_id: selected.id,
          splits: [{ reference_type: selectedCandidate.reference_type, reference_id: selectedCandidate.id, amount: matchAmount, split_note: selected.description || "" }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Match failed");
      setSuccess(t("กระทบยอดเรียบร้อย", "Reconciled successfully"));
      setSelected(null);
      setSelectedCandidate(null);
      setMatchAmount("");
      await loadData();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  const filteredCandidates = candidates.filter((c) => c.reference_type === candidateType);

  return (
    <div className="py-6 min-w-0">
      <FinancePageHeader title={t("กระทบยอดธนาคาร", "Bank Reconciliation")} description={t("จับคู่รายการเดินบัญชีกับรายรับ รายจ่าย และเงินสดย่อย", "Match bank statements with payments, expenses, and petty cash")}>
        <button onClick={() => setAddOpen((v) => !v)} className="btn-primary w-full sm:w-auto">+ {t("เพิ่มรายการเดินบัญชี", "Add statement")}</button>
      </FinancePageHeader>

      {message && <div className="mb-4 rounded-xl border px-4 py-3 text-sm bg-red-50 border-red-200 text-red-700">{message}</div>}
      {success && <div className="mb-4 rounded-xl border px-4 py-3 text-sm bg-brand-50 border-brand-100 text-brand-700">{success}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label={t("ยังไม่กระทบยอด", "Unreconciled")} value={summary.unreconciledCount} hint={formatMoney(summary.unreconciledAmount, lang)} tone="amber" />
        <KpiCard label={t("กระทบยอดแล้ว", "Reconciled")} value={summary.reconciledCount} tone="emerald" />
        <KpiCard label={t("รายการจับคู่", "Candidates")} value={summary.candidateCount} tone="blue" />
        <KpiCard label={t("ทั้งหมด", "Total")} value={statements.length} />
      </div>

      <FinanceTabs tabs={[{ key: "unreconciled", label: t("ยังไม่กระทบยอด", "Unreconciled") }, { key: "all", label: t("ทั้งหมด", "All") }]} active={view} onChange={setView} />

      {addOpen && (
        <div className="card mb-6">
          <div className="flex justify-between mb-4"><h2 className="font-semibold">{t("เพิ่มรายการเดินบัญชี", "Add bank statement")}</h2><button onClick={() => setAddOpen(false)} className="text-surface-500">✕</button></div>
          <form onSubmit={addStatement} className="grid md:grid-cols-3 gap-3">
            <input name="transaction_date" type="date" className="input-field" required />
            <input name="description" className="input-field md:col-span-2" placeholder={t("รายละเอียด", "Description")} required />
            <input name="deposit" className="input-field" placeholder={t("ฝากเข้า", "Deposit")} />
            <input name="withdraw" className="input-field" placeholder={t("ถอนออก", "Withdraw")} />
            <input name="remaining_balance" className="input-field" placeholder={t("ยอดคงเหลือ", "Balance")} />
            <input name="statement_account" className="input-field" placeholder={t("บัญชี", "Account")} />
            <input name="external_reference" className="input-field" placeholder={t("เลขอ้างอิง", "Reference")} />
            <button disabled={saving} className="btn-primary">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-surface-500">{t("กำลังโหลด...", "Loading...")}</div>
        ) : statements.length === 0 ? (
          <div className="text-center py-12 text-surface-500">{t("ไม่มีรายการค้างกระทบยอด", "No unreconciled statements")}</div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-50 text-surface-500"><tr><th className="p-3 text-left">{t("วันที่", "Date")}</th><th className="p-3 text-left">{t("รายละเอียด", "Description")}</th><th className="p-3 text-right">{t("ยอด statement", "Statement")}</th><th className="p-3 text-right">{t("จับคู่แล้ว", "Split")}</th><th className="p-3 text-right">{t("คงเหลือ", "Remaining")}</th><th className="p-3 text-left">{t("สถานะ", "Status")}</th><th className="p-3"></th></tr></thead>
                <tbody>{statements.map((s) => <tr key={s.id} className="border-t border-surface-100 hover:bg-surface-50"><td className="p-3">{formatDate(s.transaction_date, lang)}</td><td className="p-3 max-w-md break-words">{s.description}</td><td className="p-3 text-right tabular-nums">{formatMoney(s.statement_amount, lang)}</td><td className="p-3 text-right tabular-nums">{formatMoney(s.split_amount, lang)}</td><td className="p-3 text-right tabular-nums">{formatMoney(s.unreconciled_amount, lang)}</td><td className="p-3"><FinanceStatusBadge status={Boolean(s.is_reconciled)} lang={lang} /></td><td className="p-3 text-right"><button onClick={() => { setSelected(s); setMatchAmount(String(Math.abs(numberValue(s.unreconciled_amount || s.statement_amount)))); }} className="text-brand-600 font-medium hover:underline">{t("จับคู่", "Match")}</button></td></tr>)}</tbody>
              </table>
            </div>
            <div className="lg:hidden divide-y divide-surface-100">
              {statements.map((s) => <div key={s.id} className="p-4"><div className="flex justify-between gap-2"><div className="min-w-0"><div className="font-semibold">{formatDate(s.transaction_date, lang)}</div><div className="text-sm text-surface-500 break-words">{s.description}</div></div><FinanceStatusBadge status={Boolean(s.is_reconciled)} lang={lang} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div>{t("ยอด", "Amount")}<div className="font-semibold">{formatMoney(s.statement_amount, lang)}</div></div><div>{t("คงเหลือ", "Remaining")}<div className="font-semibold text-amber-700">{formatMoney(s.unreconciled_amount, lang)}</div></div></div><button onClick={() => { setSelected(s); setMatchAmount(String(Math.abs(numberValue(s.unreconciled_amount || s.statement_amount)))); }} className="mt-3 w-full rounded-xl bg-brand-50 text-brand-700 py-2 text-sm font-medium">{t("จับคู่", "Match")}</button></div>)}
            </div>
          </>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40" role="dialog" aria-modal="true" onClick={() => setSelected(null)}>
          <div className="absolute inset-x-0 bottom-0 md:inset-y-0 md:right-0 md:left-auto w-full md:w-[460px] bg-white rounded-t-2xl md:rounded-none p-4 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between gap-3 mb-4"><div><h2 className="font-semibold text-surface-900">{t("จับคู่รายการเดินบัญชี", "Match statement")}</h2><p className="text-sm text-surface-500 break-words">{selected.description}</p></div><button onClick={() => setSelected(null)} className="text-surface-500">✕</button></div>
            <div className="rounded-xl bg-amber-50 text-amber-800 p-3 text-sm mb-4">{t("ยอดคงเหลือ", "Remaining")}: <b>{formatMoney(selected.unreconciled_amount || selected.statement_amount, lang)}</b></div>
            <FinanceTabs tabs={[{ key: "payment", label: t("รายรับ", "Payments") }, { key: "expense_item", label: t("รายจ่าย", "Expenses") }]} active={candidateType} onChange={setCandidateType} />
            <div className="space-y-2 mb-4 max-h-72 overflow-y-auto">
              {filteredCandidates.map((c) => <button key={`${c.reference_type}-${c.id}`} onClick={() => { setSelectedCandidate(c); setMatchAmount(String(Math.abs(numberValue(c.amount)))); }} className={`w-full text-left rounded-xl border p-3 text-sm ${selectedCandidate?.id === c.id ? "border-brand-300 bg-brand-50" : "border-surface-200 hover:bg-surface-50"}`}><div className="font-medium break-words">{c.label || c.receipt_number || c.house_number || c.request_number || c.id}</div><div className="text-surface-500">{formatMoney(c.amount, lang)} · {formatDate(c.date, lang)}</div></button>)}
              {filteredCandidates.length === 0 && <div className="text-sm text-surface-500 text-center py-6">{t("ไม่พบรายการที่จับคู่ได้", "No matching candidates")}</div>}
            </div>
            <form onSubmit={submitSplit} className="space-y-3"><input className="input-field" value={matchAmount} onChange={(e) => setMatchAmount(e.target.value)} placeholder={t("ยอดที่จับคู่", "Match amount")} required /><button disabled={saving || !selectedCandidate || !matchAmount} className="btn-primary w-full">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึกการจับคู่", "Save match")}</button></form>
          </div>
        </div>
      )}
    </div>
  );
}
