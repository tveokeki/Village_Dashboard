"use client";

import { useEffect, useMemo, useState } from "react";
import FinancePageHeader from "@/components/finance/FinancePageHeader";
import FinanceTabs from "@/components/finance/FinanceTabs";
import FinanceStatusBadge from "@/components/finance/FinanceStatusBadge";
import KpiCard from "@/components/finance/KpiCard";
import { formatDate, formatMoney, numberValue, uatPath } from "@/components/finance/finance-format";
import { useLanguage } from "@/components/LanguageContext";
import { useCurrentUser } from "@/lib/current-user-client";
import * as XLSX from "xlsx-js-style";
import { Download } from "lucide-react";

export default function ReconciliationPage() {
  const { lang } = useLanguage();
  const { user } = useCurrentUser();
  const isAccountant = user?.roles?.includes("accountant") ?? false;
  const hasFinanceRole = user?.roles?.some((r) => ["admin", "manager", "accountant"].includes(r)) ?? false;
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const [view, setView] = useState("unreconciled");
  const [statements, setStatements] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [candidateType, setCandidateType] = useState("payment");
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
  const [matchAmount, setMatchAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const exportToExcel = () => {
    const headers = [
      t("วันที่", "Date"),
      t("บัญชี", "Account"),
      t("รายละเอียด", "Description"),
      t("ฝากเข้า (เข้า)", "Deposit (In)"),
      t("ถอนออก (ออก)", "Withdraw (Out)"),
      t("ยอดเงินตามสเตตเมนต์", "Statement Amount"),
      t("ยอดคงค้างกระทบยอด", "Unreconciled Amount"),
      t("สถานะ", "Status")
    ];

    const rowsData = statements.map((s) => [
      formatDate(s.transaction_date, lang),
      s.bank_account_number || "",
      s.description || "",
      numberValue(s.deposit),
      numberValue(s.withdraw),
      numberValue(s.statement_amount),
      numberValue(s.unreconciled_amount),
      s.is_reconciled ? t("กระทบยอดแล้ว", "Reconciled") : t("รอดำเนินการ", "Pending")
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rowsData]);
    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
    for (let r = 1; r <= range.e.r; r++) {
      [3, 4, 5, 6].forEach((c) => {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (worksheet[addr]) {
          worksheet[addr].t = "n";
          worksheet[addr].z = "#,##0.00";
        }
      });
    }

    worksheet["!cols"] = [
      { wch: 15 },
      { wch: 18 },
      { wch: 35 },
      { wch: 15 },
      { wch: 15 },
      { wch: 18 },
      { wch: 18 },
      { wch: 15 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Bank Reconciliation");
    XLSX.writeFile(workbook, `BankReconciliation_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

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
      setSelectedCandidate(null);
      setMatchAmount("");

      // Load fresh data
      const resData = await fetch(uatPath(`/api/finance/reconciliation${view === "all" ? "?unreconciled=false" : ""}`), { cache: "no-store" });
      const freshData = await resData.json();
      if (resData.ok) {
        const sorted = [...(freshData.statements || [])].sort((a, b) => Number(a.is_reconciled) - Number(b.is_reconciled));
        setStatements(sorted);
        setCandidates(freshData.candidates || []);

        if (selected) {
          const freshSelected = sorted.find((s) => s.id === selected.id);
          if (!freshSelected || freshSelected.is_reconciled) {
            setSelected(null);
          } else {
            setSelected(freshSelected);
          }
        }
      } else {
        setSelected(null);
        await loadData();
      }
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteSplit(splitId: string, statement?: any) {
    if (!confirm(t("ต้องการยกเลิกการจับคู่นี้ใช่หรือไม่?", "Do you want to delete this match?"))) return;
    setSaving(true);
    setMessage("");
    setSuccess("");
    try {
      const res = await fetch(uatPath("/api/finance/reconciliation"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_split",
          split_id: splitId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete match");
      setSuccess(t("ยกเลิกการจับคู่เรียบร้อย", "Match deleted successfully"));

      // Load fresh data
      const resData = await fetch(uatPath(`/api/finance/reconciliation${view === "all" ? "?unreconciled=false" : ""}`), { cache: "no-store" });
      const freshData = await resData.json();
      if (resData.ok) {
        const sorted = [...(freshData.statements || [])].sort((a, b) => Number(a.is_reconciled) - Number(b.is_reconciled));
        setStatements(sorted);
        setCandidates(freshData.candidates || []);

        const activeId = statement?.id || selected?.id;
        if (activeId) {
          const freshSelected = sorted.find((s) => s.id === activeId);
          if (freshSelected && !freshSelected.is_reconciled) {
            setSelected(freshSelected);
            const defaultType = Number(freshSelected.deposit) > 0 ? "payment" : "expense_item";
            setCandidateType(defaultType);
            setSelectedCandidate(null);
            setMatchAmount(String(Math.abs(numberValue(freshSelected.unreconciled_amount || freshSelected.statement_amount))));
          } else {
            setSelected(null);
          }
        } else {
          setSelected(null);
        }
      } else {
        setSelected(null);
        await loadData();
      }
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteStatementLine(lineId: string) {
    if (!confirm(t("ต้องการลบรายการเดินบัญชีนี้ใช่หรือไม่? (รายการนี้จะถูกลบออกถาวร)", "Are you sure you want to delete this statement line? (This will be permanently removed)"))) return;
    setSaving(true);
    setMessage("");
    setSuccess("");
    try {
      const res = await fetch(uatPath("/api/finance/reconciliation"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_statement",
          line_id: lineId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete statement line");
      setSuccess(t("ลบรายการเดินบัญชีเรียบร้อย", "Statement line deleted successfully"));
      setSelected(null);
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
        <div className="flex gap-2 w-full sm:w-auto flex-wrap">
          <button
            onClick={exportToExcel}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-bold text-white shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
          >
            <Download size={16} />
            {t("ส่งออก Excel", "Export Excel")}
          </button>
          {hasFinanceRole && (
            <button onClick={() => setAddOpen((v) => !v)} className="btn-primary w-full sm:w-auto">+ {t("เพิ่มรายการเดินบัญชี", "Add statement")}</button>
          )}
        </div>
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
                <thead className="bg-surface-50 text-surface-500">
                  <tr>
                    <th className="p-3 text-left">{t("วันที่", "Date")}</th>
                    <th className="p-3 text-left">{t("รายละเอียด", "Description")}</th>
                    <th className="p-3 text-right">{t("ยอด statement", "Statement")}</th>
                    <th className="p-3 text-right">{t("จับคู่แล้ว", "Split")}</th>
                    <th className="p-3 text-right">{t("คงเหลือ", "Remaining")}</th>
                    <th className="p-3 text-left">{t("สถานะ", "Status")}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {statements.flatMap((s: any) => {
                    const isExpanded = expandedIds.has(s.id);
                    const mainRow = (
                      <tr key={s.id} className={`border-t border-surface-100 hover:bg-surface-50 ${isExpanded ? "bg-surface-50/50" : ""}`}>
                        <td className="p-3">{formatDate(s.transaction_date, lang)}</td>
                        <td className="p-3 max-w-md break-words">{s.description}</td>
                        <td className="p-3 text-right tabular-nums">{formatMoney(s.statement_amount, lang)}</td>
                        <td className="p-3 text-right tabular-nums">{formatMoney(s.split_amount, lang)}</td>
                        <td className="p-3 text-right tabular-nums">{formatMoney(s.unreconciled_amount, lang)}</td>
                        <td className="p-3">
                          <FinanceStatusBadge status={Boolean(s.is_reconciled)} lang={lang} />
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-3 ml-auto w-fit">
                            {hasFinanceRole && (!s.splits || s.splits.length === 0) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteStatementLine(s.id);
                                }}
                                className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition-colors"
                                title={t("ลบรายการเดินบัญชี", "Delete Statement Line")}
                              >
                                🗑️
                              </button>
                            )}
                            <button
                              onClick={() => {
                                toggleExpand(s.id);
                                if (!s.is_reconciled && isAccountant) {
                                  if (selected?.id === s.id) {
                                    setSelected(null);
                                  } else {
                                    setSelected(s);
                                    const defaultType = Number(s.deposit) > 0 ? "payment" : "expense_item";
                                    setCandidateType(defaultType);
                                    setSelectedCandidate(null);
                                    setMatchAmount(String(Math.abs(numberValue(s.unreconciled_amount || s.statement_amount))));
                                  }
                                }
                              }}
                              className="text-brand-600 font-medium hover:underline flex items-center justify-end gap-1"
                          >
                            <span>
                              {s.is_reconciled
                                ? (isExpanded ? t("ซ่อนรายละเอียด", "Hide details") : t("ดูรายละเอียด", "Details"))
                                : (isAccountant
                                    ? (isExpanded ? t("ซ่อนการจับคู่", "Hide matching") : t("จับคู่", "Match"))
                                    : (isExpanded ? t("ซ่อนรายละเอียด", "Hide details") : t("ดูรายละเอียด", "Details"))
                                  )}
                            </span>
                            <span className="text-xs transition-transform duration-200" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                              ▼
                            </span>
                          </button>
                        </div>
                        </td>
                      </tr>
                    );

                    if (!isExpanded) return [mainRow];

                    const detailRow = (
                      <tr key={`${s.id}-detail`} className="bg-surface-50/10 border-b border-surface-100">
                        <td colSpan={7} className="p-4 pl-8">
                          <div className="max-w-4xl border border-surface-200 rounded-2xl bg-white p-5 shadow-sm space-y-4 text-left">
                            {s.splits && s.splits.length > 0 && (
                              <div className="p-4 rounded-xl bg-surface-50 border border-surface-200">
                                <h4 className="font-semibold text-xs text-surface-500 uppercase tracking-wider mb-3">
                                  {t("รายการที่จับคู่แล้ว", "Already Matched Items")}
                                </h4>
                                <div className="divide-y divide-surface-100 bg-white rounded-lg border border-surface-200 overflow-hidden">
                                  {s.splits.map((split: any) => {
                                    const labelText = split.reference_label || (split.reference_type === "payment" ? t("รายรับ", "Payment") : t("รายจ่าย", "Expense")) + ` ID: ${split.reference_id.substring(0, 8)}`;
                                    return (
                                      <div key={split.id} className="flex justify-between items-center p-3 text-sm hover:bg-surface-50/50">
                                        <div className="min-w-0 flex-1">
                                          <div className="font-medium text-surface-900 truncate">{labelText}</div>
                                          <div className="text-xs text-surface-500">
                                            {split.reference_type === "payment" ? t("รายรับ", "Payment") : t("รายจ่าย", "Expense")}
                                            {split.split_note && ` · ${split.split_note}`}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-4 ml-4">
                                          <span className="font-semibold text-brand-600 tabular-nums">{formatMoney(split.amount, lang)}</span>
                                          {isAccountant && (
                                            <button
                                              onClick={() => deleteSplit(split.id)}
                                              className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 font-bold transition-colors"
                                              title={t("ยกเลิกการจับคู่", "Cancel Match")}
                                            >
                                              ✕
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {!s.is_reconciled && isAccountant && selected?.id === s.id && (
                              <div className="space-y-4 pt-2 border-t border-dashed border-surface-200">
                                <h4 className="font-semibold text-sm text-surface-800">
                                  {t("ทำรายการจับคู่ใหม่", "Match New Item")}
                                </h4>
                                <div className="rounded-xl bg-amber-50 text-amber-800 p-3 text-sm font-medium">
                                  {t("ยอดเงินคงเหลือรอการจับคู่", "Remaining Amount to Match")}: {formatMoney(s.unreconciled_amount ?? s.statement_amount, lang)}
                                </div>
                                <div className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
                                  {Number(s.deposit) > 0
                                    ? t("รายการรายรับที่สามารถจับคู่ได้ (ยอดชำระของสมาชิก)", "Eligible Revenue Candidates (Member Payments)")
                                    : t("รายการรายจ่ายที่สามารถจับคู่ได้ (ใบสำคัญจ่าย)", "Eligible Expense Candidates (Expense Items)")}
                                </div>
                                <div className="grid md:grid-cols-12 gap-4">
                                  <div className="md:col-span-8 space-y-2 max-h-60 overflow-y-auto border border-surface-200 rounded-xl p-3 bg-surface-50/50">
                                    {filteredCandidates.map((c: any) => (
                                      <button
                                        key={`${c.reference_type}-${c.id}`}
                                        type="button"
                                        onClick={() => {
                                          setSelectedCandidate(c);
                                          setMatchAmount(String(Math.abs(numberValue(c.amount))));
                                        }}
                                        className={`w-full text-left rounded-xl border p-3 text-sm transition-all ${
                                          selectedCandidate?.id === c.id
                                            ? "border-brand-300 bg-brand-50 shadow-sm ring-1 ring-brand-300"
                                            : "border-surface-200 bg-white hover:bg-surface-50"
                                        }`}
                                      >
                                        <div className="font-medium break-words text-surface-900">
                                          {c.label || c.receipt_number || c.house_number || c.request_number || c.id}
                                        </div>
                                        <div className="text-xs text-surface-500 mt-1">
                                          {formatMoney(c.amount, lang)} · {formatDate(c.date, lang)}
                                        </div>
                                      </button>
                                    ))}
                                    {filteredCandidates.length === 0 && (
                                      <div className="text-sm text-surface-500 text-center py-8 bg-white rounded-lg border border-dashed border-surface-200">
                                        {t("ไม่พบรายการที่จับคู่ได้", "No matching candidates")}
                                      </div>
                                    )}
                                  </div>

                                  <div className="md:col-span-4 flex flex-col justify-end">
                                    <form onSubmit={submitSplit} className="space-y-3 bg-surface-50 border border-surface-200 rounded-xl p-4">
                                      <div>
                                        <label className="block text-xs font-semibold text-surface-500 mb-1">{t("ระบุยอดจับคู่ (฿)", "Match Amount")}</label>
                                        <input
                                          className="input-field bg-white"
                                          value={matchAmount}
                                          onChange={(e) => setMatchAmount(e.target.value)}
                                          placeholder={t("ยอดที่จับคู่", "Match amount")}
                                          required
                                        />
                                      </div>
                                      <button
                                        type="submit"
                                        disabled={saving || !selectedCandidate || !matchAmount}
                                        className="btn-primary w-full py-2.5"
                                      >
                                        {saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึกการจับคู่", "Save Match")}
                                      </button>
                                    </form>
                                  </div>
                                </div>
                              </div>
                            )}

                            {!s.is_reconciled && isAccountant && selected?.id !== s.id && (
                              <div className="pt-4 border-t border-dashed border-surface-200 flex flex-col sm:flex-row justify-between items-center bg-surface-50/50 p-4 rounded-xl border border-surface-150 gap-3">
                                <span className="text-sm text-surface-600 font-medium">{t("รายการนี้ยังกระทบยอดไม่ครบถ้วน (มียอดเงินคงค้าง)", "This statement line is not fully reconciled yet (remaining balance pending)")}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelected(s);
                                    const defaultType = Number(s.deposit) > 0 ? "payment" : "expense_item";
                                    setCandidateType(defaultType);
                                    setSelectedCandidate(null);
                                    setMatchAmount(String(Math.abs(numberValue(s.unreconciled_amount || s.statement_amount))));
                                  }}
                                  className="btn-primary py-1.5 px-4 text-xs font-semibold hover:opacity-90 shadow-sm whitespace-nowrap"
                                >
                                  {t("จับคู่ส่วนที่เหลือ", "Match Remaining")}
                                </button>
                              </div>
                            )}

                            {!s.is_reconciled && !isAccountant && (
                              <div className="text-sm text-surface-500 text-center py-4 bg-surface-50 rounded-xl border border-dashed border-surface-200">
                                {t("สิทธิ์อ่านอย่างเดียว (สำหรับเจ้าหน้าที่บัญชีเท่านั้นที่สามารถบันทึกได้)", "Read-only access (Accountant role required to make changes)")}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );

                    return [mainRow, detailRow];
                  })}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden divide-y divide-surface-100">
              {statements.map((s: any) => {
                const isExpanded = expandedIds.has(s.id);
                return (
                  <div key={s.id} className={`p-4 transition-colors ${isExpanded ? "bg-surface-50/50" : ""}`}>
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold">{formatDate(s.transaction_date, lang)}</div>
                        <div className="text-sm text-surface-500 break-words">{s.description}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasFinanceRole && (!s.splits || s.splits.length === 0) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteStatementLine(s.id);
                            }}
                            className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition-colors"
                            title={t("ลบรายการเดินบัญชี", "Delete Line")}
                          >
                            🗑️
                          </button>
                        )}
                        <FinanceStatusBadge status={Boolean(s.is_reconciled)} lang={lang} />
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        {t("ยอด", "Amount")}
                        <div className="font-semibold">{formatMoney(s.statement_amount, lang)}</div>
                      </div>
                      <div>
                        {t("คงเหลือ", "Remaining")}
                        <div className="font-semibold text-amber-700">{formatMoney(s.unreconciled_amount, lang)}</div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        toggleExpand(s.id);
                        if (!s.is_reconciled && isAccountant) {
                          if (selected?.id === s.id) {
                            setSelected(null);
                          } else {
                            setSelected(s);
                            const defaultType = Number(s.deposit) > 0 ? "payment" : "expense_item";
                            setCandidateType(defaultType);
                            setSelectedCandidate(null);
                            setMatchAmount(String(Math.abs(numberValue(s.unreconciled_amount || s.statement_amount))));
                          }
                        }
                      }}
                      className={`mt-3 w-full rounded-xl py-2 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
                        isExpanded ? "bg-surface-200 text-surface-800" : (s.is_reconciled ? "bg-surface-100 text-surface-700" : (isAccountant ? "bg-brand-50 text-brand-700" : "bg-surface-100 text-surface-700"))
                      }`}
                    >
                      <span>
                        {s.is_reconciled
                          ? (isExpanded ? t("ซ่อนรายละเอียด", "Hide details") : t("ดูรายละเอียด", "Details"))
                          : (isAccountant
                              ? (isExpanded ? t("ซ่อนการจับคู่", "Hide matching") : t("จับคู่", "Match"))
                              : (isExpanded ? t("ซ่อนรายละเอียด", "Hide details") : t("ดูรายละเอียด", "Details"))
                            )}
                      </span>
                      <span className="text-xs transition-transform duration-200" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                        ▼
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="mt-4 p-4 border border-surface-200 rounded-xl bg-white shadow-sm space-y-4">
                        {s.splits && s.splits.length > 0 && (
                          <div className="space-y-2 text-left">
                            <h4 className="font-semibold text-xs text-surface-500 uppercase tracking-wider">{t("รายการที่จับคู่แล้ว", "Already Matched Items")}</h4>
                            <div className="divide-y divide-surface-100 border border-surface-200 rounded-lg overflow-hidden bg-white">
                              {s.splits.map((split: any) => {
                                const labelText = split.reference_label || (split.reference_type === "payment" ? t("รายรับ", "Payment") : t("รายจ่าย", "Expense")) + ` ID: ${split.reference_id.substring(0, 8)}`;
                                return (
                                  <div key={split.id} className="flex justify-between items-center p-3 text-sm">
                                    <div className="min-w-0 flex-1">
                                      <div className="font-medium text-surface-900 truncate">{labelText}</div>
                                      <div className="text-xs text-surface-500 truncate">{split.reference_type === "payment" ? t("รายรับ", "Payment") : t("รายจ่าย", "Expense")}</div>
                                    </div>
                                    <div className="flex items-center gap-3 ml-3">
                                      <span className="font-semibold text-brand-600 tabular-nums">{formatMoney(split.amount, lang)}</span>
                                      {isAccountant && (
                                        <button onClick={() => deleteSplit(split.id)} className="text-red-500 hover:text-red-700 p-1 font-bold">✕</button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {!s.is_reconciled && isAccountant && selected?.id === s.id && (
                          <div className="space-y-3 pt-3 border-t border-dashed border-surface-200 text-left">
                            <div className="rounded-xl bg-amber-50 text-amber-800 p-3 text-sm font-medium">
                              {t("ยอดเงินคงเหลือ", "Remaining")}: {formatMoney(s.unreconciled_amount ?? s.statement_amount, lang)}
                            </div>
                            <div className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">
                              {Number(s.deposit) > 0
                                ? t("รายการรายรับที่สามารถจับคู่ได้", "Eligible Payments")
                                : t("รายการรายจ่ายที่สามารถจับคู่ได้", "Eligible Expenses")}
                            </div>
                            <div className="space-y-2 max-h-48 overflow-y-auto border border-surface-200 rounded-xl p-2 bg-surface-50">
                              {filteredCandidates.map((c: any) => (
                                <button
                                  key={`${c.reference_type}-${c.id}`}
                                  type="button"
                                  onClick={() => {
                                    setSelectedCandidate(c);
                                    setMatchAmount(String(Math.abs(numberValue(c.amount))));
                                  }}
                                  className={`w-full text-left rounded-lg border p-2.5 text-sm transition-all ${
                                    selectedCandidate?.id === c.id ? "border-brand-300 bg-brand-50" : "border-surface-200 bg-white"
                                  }`}
                                >
                                  <div className="font-medium truncate text-surface-900">{c.label || c.receipt_number || c.house_number || c.request_number || c.id}</div>
                                  <div className="text-xs text-surface-500 mt-0.5">{formatMoney(c.amount, lang)}</div>
                                </button>
                              ))}
                              {filteredCandidates.length === 0 && (
                                <div className="text-xs text-surface-500 text-center py-4 bg-white rounded-lg border border-dashed border-surface-200">
                                  {t("ไม่พบรายการ", "No candidates")}
                                </div>
                              )}
                            </div>
                            <form onSubmit={submitSplit} className="space-y-2.5 bg-surface-50 border border-surface-200 rounded-xl p-3">
                              <input
                                className="input-field bg-white"
                                value={matchAmount}
                                onChange={(e) => setMatchAmount(e.target.value)}
                                placeholder={t("ยอดที่จับคู่", "Match amount")}
                                required
                              />
                              <button type="submit" disabled={saving || !selectedCandidate || !matchAmount} className="btn-primary w-full py-2">
                                {saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึกการจับคู่", "Save Match")}
                              </button>
                            </form>
                          </div>
                        )}

                        {!s.is_reconciled && isAccountant && selected?.id !== s.id && (
                          <div className="pt-3 border-t border-dashed border-surface-200 flex flex-col justify-between items-center bg-surface-50/50 p-3 rounded-xl border border-surface-150 gap-2.5 text-left w-full">
                            <span className="text-xs text-surface-600 font-medium">{t("รายการนี้ยังกระทบยอดไม่ครบถ้วน (มียอดเงินคงค้าง)", "This statement line is not fully reconciled yet (remaining balance pending)")}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelected(s);
                                const defaultType = Number(s.deposit) > 0 ? "payment" : "expense_item";
                                setCandidateType(defaultType);
                                setSelectedCandidate(null);
                                setMatchAmount(String(Math.abs(numberValue(s.unreconciled_amount || s.statement_amount))));
                              }}
                              className="btn-primary py-2 w-full text-xs font-semibold hover:opacity-90 shadow-sm"
                            >
                              {t("จับคู่ส่วนที่เหลือ", "Match Remaining")}
                            </button>
                          </div>
                        )}

                        {!s.is_reconciled && !isAccountant && (
                          <div className="text-xs text-surface-500 text-center py-3 bg-surface-50 rounded-xl border border-dashed border-surface-200">
                            {t("สิทธิ์อ่านอย่างเดียว", "Read-only access")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
