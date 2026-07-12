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

type ExpenseItemInput = { id?: string; description: string; category: string; subcategory: string; notes: string; amount: string; payment_source: string; spent_at: string; receipt_file_path?: string };

export default function ExpensesPage() {
  const { lang } = useLanguage();
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const { user } = useCurrentUser();
  const isAccountant = user?.roles?.includes("accountant") ?? false;
  const isAdmin = user?.roles?.includes("admin") ?? user?.isAdmin ?? false;
  const isPresident = user?.roles?.includes("president") || user?.roles?.includes("vice_president") || false;
  const isManager = user?.roles?.includes("manager") ?? false;

  const [tab, setTab] = useState("requests");
  const [requests, setRequests] = useState<any[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [approvalAction, setApprovalAction] = useState<"approved" | "rejected" | "disbursed" | "spent" | "closed" | "cancelled" | null>(null);
  const [items, setItems] = useState<ExpenseItemInput[]>([{ description: "", category: "", subcategory: "", notes: "", amount: "", payment_source: "bank_transfer", spent_at: "", receipt_file_path: "" }]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [paymentReceipt, setPaymentReceipt] = useState("");

  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);

  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch("/api/dropdown-options?groups=expense_categories");
        const data = await res.json();
        if (data.groups && data.groups.expense_categories) {
          setExpenseCategories(data.groups.expense_categories);
        }
      } catch (err) {
        console.error("Failed to fetch expense categories:", err);
      }
    }
    fetchCategories();
  }, []);

  const mainCategories = useMemo(() => {
    const uniques = Array.from(new Set(expenseCategories.map((x) => x.main_category)));
    return uniques.sort((a, b) => a.localeCompare(b, "th"));
  }, [expenseCategories]);

  const getSubcategories = (mainCategory: string) => {
    return expenseCategories
      .filter((x) => x.main_category === mainCategory)
      .map((x) => x.sub_category)
      .sort((a, b) => a.localeCompare(b, "th"));
  };
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  // Dynamic uploads inside individual approval steps
  const [uploadingItemReceiptIndex, setUploadingItemReceiptIndex] = useState<string | null>(null);
  const [itemReceiptPaths, setItemReceiptPaths] = useState<Record<string, string>>({});

  useEffect(() => {
    setPaymentReceipt("");
    setItemReceiptPaths({});
  }, [selected, approvalAction]);

  async function handleUploadPaymentReceipt(file: File) {
    if (!file) return;
    setUploadingReceipt(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "documents");
      const res = await fetch(uatPath("/api/admin/upload"), {
        method: "POST",
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setPaymentReceipt(data.file_path);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploadingReceipt(false);
    }
  }

  async function handleUploadItemReceipt(itemId: string, file: File) {
    if (!file) return;
    setUploadingItemReceiptIndex(itemId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "documents");
      const res = await fetch(uatPath("/api/admin/upload"), {
        method: "POST",
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setItemReceiptPaths((prev) => ({ ...prev, [itemId]: data.file_path }));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploadingItemReceiptIndex(null);
    }
  }

  async function handleUploadReceipt(index: number, file: File) {
    if (!file) return;
    setUploadingIndex(index);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "documents");
      const res = await fetch(uatPath("/api/admin/upload"), {
        method: "POST",
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      updateItem(index, "receipt_file_path", data.file_path);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploadingIndex(null);
    }
  }

  const exportToExcel = () => {
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Expense Requests
    const headers = [
      t("เลขที่เอกสาร", "Doc No"),
      t("หัวข้อ", "Title"),
      t("ผู้เสนอเบิก", "Requester"),
      t("ยอดเงินรวม", "Total Amount"),
      t("สถานะ", "Status"),
      t("วันที่ขอเบิก", "Requested Date")
    ];

    const rowsData = requests.map((r) => [
      r.request_number || r.id,
      r.title || "",
      r.requester_name || "",
      numberValue(r.total_approved || r.total_requested),
      t(
        r.status === "closed" ? "ปิดยอดแล้ว" : r.status === "spent" ? "จ่ายครบแล้ว" : r.status === "disbursed" ? "โอนเงินแล้ว" : r.status === "approved" ? "อนุมัติแล้ว" : r.status === "rejected" ? "ปฏิเสธ" : r.status === "cancelled" ? "ยกเลิก" : "รอดำเนินการ",
        r.status === "closed" ? "Closed" : r.status === "spent" ? "Spent" : r.status === "disbursed" ? "Disbursed" : r.status === "approved" ? "Approved" : r.status === "rejected" ? "Rejected" : r.status === "cancelled" ? "Cancelled" : "Pending"
      ),
      formatDate(r.created_at, lang)
    ]);

    const worksheet1 = XLSX.utils.aoa_to_sheet([headers, ...rowsData]);
    const range1 = XLSX.utils.decode_range(worksheet1["!ref"] || "A1:A1");
    for (let r = 1; r <= range1.e.r; r++) {
      const addr = XLSX.utils.encode_cell({ r, c: 3 });
      if (worksheet1[addr]) {
        worksheet1[addr].t = "n";
        worksheet1[addr].z = "#,##0.00";
      }
    }
    worksheet1["!cols"] = [{ wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(workbook, worksheet1, "Expense Requests");

    // Sheet 2: Petty Cash Ledger
    if (ledger.length > 0) {
      const ledgerHeaders = [
        t("วันที่", "Date"),
        t("ประเภท", "Type"),
        t("รายละเอียด", "Description"),
        t("จำนวนเงิน", "Amount"),
        t("คงเหลือ", "Balance")
      ];
      const ledgerRows = ledger.map((l) => [
        formatDate(l.created_at, lang),
        l.transaction_type === "receive_surplus" ? t("เงินคงเหลือ", "Leftover Surplus") : t("จ่ายเงินสด", "Cash Expense"),
        l.description || "",
        numberValue(l.amount),
        numberValue(l.balance_after)
      ]);
      const worksheet2 = XLSX.utils.aoa_to_sheet([ledgerHeaders, ...ledgerRows]);
      const range2 = XLSX.utils.decode_range(worksheet2["!ref"] || "A1:A1");
      for (let r = 1; r <= range2.e.r; r++) {
        [3, 4].forEach((c) => {
          const addr = XLSX.utils.encode_cell({ r, c });
          if (worksheet2[addr]) {
            worksheet2[addr].t = "n";
            worksheet2[addr].z = "#,##0.00";
          }
        });
      }
      worksheet2["!cols"] = [{ wch: 15 }, { wch: 15 }, { wch: 35 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(workbook, worksheet2, "Petty Cash Ledger");
    }

    XLSX.writeFile(workbook, `ExpensesReport_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  async function loadExpenses() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(uatPath(`/api/finance/expenses?${params.toString()}`));
      const data = await res.json();
      if (res.ok) {
        setRequests(data.requests || []);
        setStats(data.stats || []);
        setBalances(data.petty_cash_balances || []);
        setLedger(data.petty_cash_ledger || []);
        // Maintain selection
        if (selected) {
          const found = (data.requests || []).find((x: any) => x.id === selected.id);
          if (found) setSelected(found);
        }
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadExpenses();
  }, [status, q]);

  useEffect(() => {
    if (typeof window !== "undefined" && requests.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const queryId = params.get("id") || params.get("query");
      if (queryId) {
        const found = requests.find((x) => x.id === queryId || x.request_number === queryId);
        if (found) {
          setSelected(found);
        }
      }
    }
  }, [requests]);

  const kpis = useMemo(() => {
    return {
      pending: stats.find((s) => s.status === "pending")?.count || 0,
      approved: stats.find((s) => s.status === "approved" || s.status === "disbursed")?.total_approved || 0,
      closed: stats.find((s) => s.status === "closed")?.total_approved || 0,
    };
  }, [stats]);

  const updateItem = (index: number, key: keyof ExpenseItemInput, value: string) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [key]: value };
      return copy;
    });
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  async function submitForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true); setMessage(""); setSuccess("");
    try {
      const payload: any = {
        title,
        description,
        notes: editingId ? (editNotes || "Expense request edited") : undefined,
        items: items.map((it) => ({
          id: it.id || undefined,
          description: it.description,
          category: it.category,
          subcategory: it.subcategory,
          notes: it.notes,
          amount: parseFloat(it.amount.replace(/,/g, "")),
          payment_source: it.payment_source,
          spent_at: it.spent_at || null,
          receipt_file_path: it.receipt_file_path || null
        }))
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
      setEditNotes("");
      setItems([{ description: "", category: "", subcategory: "", notes: "", amount: "", payment_source: "bank_transfer", spent_at: "" }]);
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
    setEditNotes("");
    setItems(r.items.map((it: any) => ({
      id: it.id,
      description: it.description,
      category: it.category,
      subcategory: it.subcategory || "",
      notes: it.notes || "",
      amount: it.amount_requested ? parseFloat(String(it.amount_requested)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
      payment_source: it.payment_source,
      spent_at: it.spent_at || "",
      receipt_file_path: it.receipt_file_path || ""
    })));
    setOpenForm(true);
  };

  const handleNewRequestClick = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setEditNotes("");
    setItems([{ description: "", category: "", subcategory: "", notes: "", amount: "", payment_source: "bank_transfer", spent_at: "", receipt_file_path: "" }]);
    setOpenForm((v) => !v);
  };

  async function submitApproval(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || !approvalAction) return;
    if (approvalAction === "rejected" && !confirm(t("ยืนยันไม่อนุมัติคำขอนี้?", "Confirm reject this request?"))) return;

    const f = new FormData(e.currentTarget);
    setSaving(true); setMessage(""); setSuccess("");
    try {
      let payload: any = { action: approvalAction };

      if (approvalAction === "approved") {
        // Collect partial approvals per item
        payload.items = selected.items.map((it: any) => {
          const approvedVal = String(f.get(`approved_amount_${it.id}`) || "").replace(/,/g, "");
          return {
            id: it.id,
            amount_approved: approvedVal === "0" ? "0.00" : (approvedVal || it.amount_requested)
          };
        });
        payload.notes = f.get("notes");
      }
      else if (approvalAction === "disbursed") {
        payload.disbursed_amount = String(f.get("disbursed_amount") || "").replace(/,/g, "");
        payload.disbursal_channel = f.get("disbursal_channel");
        payload.disbursal_receipt_path = paymentReceipt;
        payload.notes = f.get("notes");
      }
      else if (approvalAction === "spent") {
        payload.items = selected.items.filter((it: any) => it.status !== "rejected").map((it: any) => {
          const actualVal = String(f.get(`actual_spent_${it.id}`) || "").replace(/,/g, "");
          const spentAtVal = f.get(`spent_at_${it.id}`);
          const receiptVal = itemReceiptPaths[it.id] || it.receipt_file_path;
          return {
            id: it.id,
            amount_approved: actualVal || it.amount_approved || it.amount_requested,
            spent_at: spentAtVal || null,
            receipt_file_path: receiptVal || null
          };
        });
        payload.notes = f.get("notes");
      }
      else if (approvalAction === "closed" || approvalAction === "cancelled") {
        payload.notes = f.get("notes");
      }

      const res = await fetch(uatPath(`/api/finance/expenses/${selected.id}/approval`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");

      setSuccess(t("บันทึกสถานะการเบิกจ่ายเรียบร้อยแล้วค่ะ", "Expense flow state saved successfully"));
      setApprovalAction(null);
      setSelected(data.request || null);
      await loadExpenses();
    } catch (err: any) { setMessage(err.message); } finally { setSaving(false); }
  }

  async function submitPettySpend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const f = new FormData(e.currentTarget);
    setSaving(true); setMessage(""); setSuccess("");
    try {
      const payload = {
        amount: String(f.get("amount") || "").replace(/,/g, ""),
        description: f.get("description"),
        transaction_date: f.get("transaction_date") || null
      };
      const res = await fetch(uatPath(`/api/finance/expenses/${selected.id}/petty-cash-spend`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Post failed");
      setSuccess(t("บันทึกการใช้เงินสดย่อยเรียบร้อยแล้วค่ะ", "Petty cash spend recorded"));
      e.currentTarget.reset();
      await loadExpenses();
    } catch (err: any) { setMessage(err.message); } finally { setSaving(false); }
  }

  const sortedLogs = useMemo(() => {
    if (!selected?.approval_logs) return [];
    return [...selected.approval_logs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [selected]);

  return (
    <div className="container mx-auto px-4 pb-24 pt-4 text-surface-900">
      <FinancePageHeader title={t("💸 บริหารงานรายจ่ายและใบตั้งเบิก", "💸 Expense & Payment Requests")} description={""} />

      <div className="grid grid-cols-3 gap-1.5 sm:gap-3 mb-6">
        <KpiCard label={t("⏳ รออนุมัติ (รายการ)", "Pending Requests")} value={kpis.pending} hint={t("ใบเบิกที่ประธานต้องอนุมัติ", "Requests awaiting approval")} tone="amber" />
        <KpiCard label={t("🟢 เบิกจ่ายแล้ว (บาท)", "Approved & Disbursed")} value={formatMoney(kpis.approved, lang)} hint={t("ยอดเงินสัญญารวม", "Approved totals")} tone="emerald" />
        <KpiCard label={t("🔒 ปิดยอดแล้ว (บาท)", "Closed/Audited Totals")} value={formatMoney(kpis.closed, lang)} hint={t("ตรวจสอบเสร็จสมบูรณ์", "Verified spent")} tone="brand" />
      </div>

      <FinanceTabs active={tab} onChange={setTab} tabs={[
        { key: "requests", label: t("📊 ใบตั้งเบิก", "Expense Requests") },
        { key: "petty", label: t("🪙 เงินสดย่อยผู้จัดการ", "Petty Cash") },
        { key: "ledger", label: t("📜 ประวัติเงินสดย่อย", "Petty Cash Ledger") }
      ]} />

      <div className="mt-4">
        {message && <div className="p-3 mb-4 rounded-xl bg-red-50 text-red-700 text-sm font-medium border border-red-100">{message}</div>}
        {success && <div className="p-3 mb-4 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-medium border border-emerald-100">{success}</div>}

                {tab === "requests" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <input className="input-field flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("🔎 ค้นหาเลขที่ใบเบิก/หัวข้อ", "Search request number/title")} />
              <select className="input-field sm:w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">{t("ทุกสถานะ", "All statuses")}</option>
                <option value="pending">{t("รออนุมัติ", "Pending Approval")}</option>
                <option value="approved">{t("อนุมัติแล้ว", "Approved")}</option>
                <option value="disbursed">{t("โอนเงินให้ผู้จัดการแล้ว", "Disbursed")}</option>
                <option value="spent">{t("ผู้จัดการจ่ายครบแล้ว", "Spent")}</option>
                <option value="closed">{t("ปิดยอดแล้ว", "Closed")}</option>
                <option value="cancelled">{t("ยกเลิก", "Cancelled")}</option>
              </select>
              <button onClick={exportToExcel} className="p-2 border rounded-xl hover:bg-surface-50 transition-colors flex items-center justify-center gap-1.5 text-sm" title={t("ส่งออกไฟล์ Excel", "Export to Excel")}>
                <Download className="w-4 h-4 text-surface-600" />
                <span className="sm:hidden lg:inline">{t("ส่งออก Excel", "Excel")}</span>
              </button>
              {(isManager || isAccountant || isAdmin) && (
                <button onClick={handleNewRequestClick} className="btn-primary shrink-0">+ {t("สร้างใบเบิกค่าใช้จ่าย", "New request")}</button>
              )}
            </div>

            {openForm && (
              <form onSubmit={submitForm} className="card border border-brand-200 bg-brand-50/20 p-4 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-lg text-brand-800">{editingId ? t("✏️ แก้ไขใบเบิก", "✏️ Edit Request") : t("📝 สร้างใบตั้งเบิกใหม่", "📝 New Request")}</h3>
                  <button type="button" onClick={() => setOpenForm(false)} className="text-surface-500 text-lg">✕</button>
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  <input value={title} onChange={(e) => setTitle(e.target.value)} required className="input-field md:col-span-1" placeholder={t("หัวข้อเบิกจ่าย", "Title")} />
                  <input value={description} onChange={(e) => setDescription(e.target.value)} className="input-field md:col-span-2" placeholder={t("คำอธิบายเพิ่มเติม", "Description")} />
                </div>

                <div className="space-y-3">
                  <div className="font-semibold text-xs uppercase tracking-wider text-surface-400">{t("รายการตั้งเบิกย่อย", "Expense Items")}</div>
                  {items.map((it, index) => (
                    <div key={index} className="p-4 bg-white rounded-2xl border border-surface-200 shadow-sm space-y-3 relative">
                      {/* Row 1 */}
                      <div className="grid grid-cols-12 gap-2.5 items-center">
                        <div className="col-span-12 md:col-span-3">
                          <label className="block text-[10px] font-bold text-surface-400 uppercase mb-0.5">{t("รายละเอียด", "Description")}</label>
                          <input required value={it.description} onChange={(e) => updateItem(index, "description", e.target.value)} className="input-field text-sm" placeholder={t("รายละเอียด", "Description")} />
                        </div>
                        <div className="col-span-12 md:col-span-3">
                          <label className="block text-[10px] font-bold text-surface-400 uppercase mb-0.5">{t("หมวดหมู่หลัก", "Category")}</label>
                          <select required value={it.category} onChange={(e) => { updateItem(index, "category", e.target.value); updateItem(index, "subcategory", ""); }} className="input-field text-sm">
                            <option value="">-- {t("เลือกหมวดหมู่หลัก", "Select Category")} --</option>
                            {mainCategories.map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-12 md:col-span-3">
                          <label className="block text-[10px] font-bold text-surface-400 uppercase mb-0.5">{t("หมวดหมู่ย่อย", "Subcategory")}</label>
                          <select required value={it.subcategory} onChange={(e) => updateItem(index, "subcategory", e.target.value)} className="input-field text-sm" disabled={!it.category}>
                            <option value="">-- {t("เลือกหมวดหมู่ย่อย", "Select Subcategory")} --</option>
                            {it.category && getSubcategories(it.category).map((sub) => (
                              <option key={sub} value={sub}>{sub}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-12 md:col-span-2">
                          <label className="block text-[10px] font-bold text-surface-400 uppercase mb-0.5">{t("จำนวนเงิน", "Amount")}</label>
                          <input required value={it.amount} onChange={(e) => updateItem(index, "amount", e.target.value)} className="input-field text-sm text-right font-semibold" placeholder={t("จำนวนเงิน", "Amount")} onFocus={(e) => { e.target.value = e.target.value.replace(/,/g, ""); }} onBlur={(e) => { const num = parseFloat(e.target.value.replace(/,/g, "")); if (!isNaN(num)) { e.target.value = num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } }} />
                        </div>
                        <div className="col-span-12 md:col-span-1 flex justify-center pt-4 md:pt-0">
                          <button type="button" disabled={items.length <= 1} onClick={() => removeItem(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-30" title={t("ลบรายการย่อย", "Remove item")}>✕</button>
                        </div>
                      </div>

                      {/* Row 2 */}
                      <div className="grid grid-cols-12 gap-2.5 items-center pt-2 border-t border-dashed border-surface-100">
                        <div className="col-span-12 md:col-span-8">
                          <label className="block text-[10px] font-bold text-surface-400 uppercase mb-0.5">{t("หมายเหตุ", "Notes")}</label>
                          <input value={it.notes} onChange={(e) => updateItem(index, "notes", e.target.value)} className="input-field text-sm" placeholder={t("หมายเหตุประกอบรายการย่อย (Free text)", "Notes for this item")} />
                        </div>
                        <div className="col-span-12 md:col-span-4">
                          <label className="block text-[10px] font-bold text-surface-400 uppercase mb-0.5">{t("แหล่งจ่ายเงิน", "Payment Source")}</label>
                          <select value={it.payment_source} onChange={(e) => updateItem(index, "payment_source", e.target.value)} className="input-field text-sm">
                            <option value="bank_transfer">{t("โอนเงินผ่านธนาคาร", "Bank Transfer")}</option>
                            <option value="petty_cash">{t("เงินสดย่อย", "Petty Cash")}</option>
                            <option value="cash">{t("เงินสด", "Cash")}</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {editingId && (
                  <div className="pt-2 border-t space-y-1">
                    <label className="block text-xs font-semibold text-brand-800">{t("✍️ หมายเหตุการแก้ไข (ระบุเหตุผลหรือการเปลี่ยนแปลง)", "✍️ Edit Notes (Explain what was changed)")} <span className="text-red-500">*</span></label>
                    <input
                      required
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className="input-field text-sm w-full border-brand-200 focus:border-brand-500 focus:ring-brand-500"
                      placeholder={t("กรุณาระบุรายละเอียดการแก้ไข เช่น แก้ไขจำนวนเงินค่าน้ำดื่ม หรือปรับปรุงหมวดหมู่ให้ถูกต้อง", "Please specify what you edited")}
                    />
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <button type="button" onClick={() => setItems([...items, { description: "", category: "", subcategory: "", notes: "", amount: "", payment_source: "bank_transfer", spent_at: "", receipt_file_path: "" }])} className="px-4 py-2 rounded-xl border text-sm font-semibold hover:bg-surface-50 transition-colors">+ {t("เพิ่มรายการย่อย", "Add line item")}</button>
                  <button disabled={saving} className="btn-primary flex-1">{saving ? t("กำลังบันทึก...", "Saving...") : (editingId ? t("บันทึกการแก้ไข", "Save changes") : t("ส่งคำขอเบิก", "Submit request"))}</button>
                </div>
              </form>
            )}

            {loading ? (
              <div className="text-center py-12 text-surface-400">{t("กำลังโหลดใบเบิกค่าใช้จ่าย...", "Loading expenses...")}</div>
            ) : requests.length === 0 ? (
              <div className="card py-12 text-center text-surface-400">{t("ไม่พบข้อมูลใบตั้งเบิก", "No expense requests found")}</div>
            ) : (
              <div className="space-y-3">
                {requests.map((r) => {
                  const isThisSelected = selected?.id === r.id;
                  return (
                    <div key={r.id} className="border border-surface-200 rounded-2xl overflow-hidden shadow-sm hover:border-brand-500 transition-all bg-white">
                      <div
                        onClick={() => {
                          if (isThisSelected) {
                            setSelected(null);
                            setApprovalAction(null);
                          } else {
                            setSelected(r);
                          }
                        }}
                        className={`p-4 cursor-pointer transition-all ${isThisSelected ? "bg-brand-50/5 border-b border-surface-100" : ""}`}
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <div className="font-semibold text-surface-900 text-base">{r.request_number} — {r.title}</div>
                            <div className="text-xs text-surface-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                              <span>👤 {t("ผู้เสนอเบิก:", "Requester:")} {r.requester_name}</span>
                              <span>📅 {formatDate(r.created_at, lang)}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <FinanceStatusBadge status={r.status} lang={lang} />
                            <div className="font-bold text-base text-brand-700">{formatMoney(r.total_requested, lang)}</div>
                          </div>
                        </div>
                      </div>

                      {isThisSelected && (
                        <div className="p-4 sm:p-5 space-y-4 bg-white border-t border-surface-100">
                          <div className="flex justify-between items-start border-b pb-3">
                            <div>
                              <h3 className="font-bold text-lg text-surface-900">{selected.request_number}</h3>
                              <div className="text-sm text-surface-500">{selected.title}</div>
                            </div>
                            <button onClick={() => { setSelected(null); setApprovalAction(null); }} className="text-surface-400 hover:text-surface-700 text-lg">✕</button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b pb-3 text-sm">
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-surface-500">{t("ผู้ขอเบิก", "Requester")}</span>
                                <span className="font-medium">{selected.requester_name}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-surface-500">{t("ยอดตั้งเบิกทั้งหมด", "Total requested")}</span>
                                <span className="font-bold text-brand-600">{formatMoney(selected.total_requested, lang)}</span>
                              </div>
                              {selected.total_approved !== null && (
                                <div className="flex justify-between">
                                  <span className="text-surface-500">{t("ยอดอนุมัติจริง", "Approved amount")}</span>
                                  <span className="font-bold text-emerald-600">{formatMoney(selected.total_approved, lang)}</span>
                                </div>
                              )}
                            </div>
                            <div className="space-y-2">
                              {selected.disbursed_amount !== null && (
                                <div className="flex justify-between">
                                  <span className="text-surface-500">{t("จำนวนเงินโอนให้ผู้จัดการ", "Disbursed amount")}</span>
                                  <span className="font-bold text-blue-600">{formatMoney(selected.disbursed_amount, lang)}</span>
                                </div>
                              )}
                              {selected.disbursal_channel && (
                                <div className="flex justify-between">
                                  <span className="text-surface-500">{t("ช่องทางการโอน", "Disbursement channel")}</span>
                                  <span className="font-medium text-surface-800">
                                    {selected.disbursal_channel === "bank_transfer" ? t("โอนผ่านธนาคาร", "Bank Transfer") : t("เงินสด", "Cash")}
                                  </span>
                                </div>
                              )}
                            </div>
                            {selected.approval_notes && (
                              <div className="col-span-1 sm:col-span-2 bg-surface-50 p-3 rounded-lg border text-xs text-surface-600">
                                💡 {t("หมายเหตุอนุมัติ:", "Approval notes:")} {selected.approval_notes}
                              </div>
                            )}
                          </div>

                          <div className="space-y-3 border-b pb-3">
                            <div className="font-semibold text-sm text-surface-900">📋 {t("รายการย่อย", "Line Items")}</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                              {selected.items?.map((it: any) => (
                                <div key={it.id} className="p-3 bg-surface-50 rounded-xl border border-surface-200 text-xs">
                                  <div className="flex justify-between font-medium text-surface-900">
                                    <span>{it.description}</span>
                                    <span className={it.status === "rejected" ? "line-through text-red-500" : ""}>
                                      {formatMoney(it.amount_requested, lang)}
                                    </span>
                                  </div>
                                  <div className="text-surface-500 mt-1 flex justify-between">
                                    <span>📁 {it.category}{it.subcategory ? ` › ${it.subcategory}` : ""}</span>
                                    <span>💳 {it.payment_source}</span>
                                  </div>
                                  {it.notes && (
                                    <div className="text-surface-500 mt-1 text-xs italic bg-white/50 p-1.5 rounded-lg border border-dashed border-surface-200">
                                      💡 {t("หมายเหตุ:", "Notes:")} {it.notes}
                                    </div>
                                  )}
                                  {it.status === "rejected" && (
                                    <div className="text-red-600 font-bold mt-1 text-right">❌ {t("ไม่อนุมัติยอดนี้", "Rejected")}</div>
                                  )}
                                  {it.amount_approved !== null && it.status !== "rejected" && (
                                    <div className="text-emerald-700 font-medium mt-1 flex justify-between">
                                      <span>💸 {selected.status === "approved" || selected.status === "disbursed" ? t("อนุมัติจริง:", "Approved Amount:") : t("จ่ายจริง:", "Spent Amount:")}</span>
                                      <span>{formatMoney(it.amount_approved, lang)}</span>
                                    </div>
                                  )}
                                  {it.spent_at && (
                                    <div className="text-surface-500 mt-1 flex justify-between">
                                      <span>🕒 {t("วันที่ใช้จ่ายจริง:", "Spent Date:")}</span>
                                      <span className="font-medium">{formatDate(it.spent_at, lang)}</span>
                                    </div>
                                  )}
                                  {it.receipt_file_path && (
                                    <div className="mt-1 flex justify-between">
                                      <span>📎 {t("หลักฐานการจ่าย:", "Proof:")}</span>
                                      <a href={uatPath(it.receipt_file_path)} target="_blank" rel="noreferrer" className="text-brand-600 underline font-medium">
                                        {t("ดูหลักฐานการจ่าย", "View Receipt")}
                                      </a>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {sortedLogs.length > 0 && (
                            <div className="space-y-3 border-b pb-4">
                              <div className="font-semibold text-sm text-surface-900">📜 {t("ประวัติการดำเนินงาน (History)", "Workflow History")}</div>
                              <div className="relative border-l border-surface-200 pl-4 ml-1.5 space-y-3 text-xs max-h-48 overflow-y-auto pr-1">
                                {sortedLogs.map((log) => {
                                  let actionLabelTh = log.action;
                                  let actionLabelEn = log.action;
                                  let colorClass = "bg-surface-400";

                                  if (log.action === "created" || log.action === "submitted") {
                                    actionLabelTh = "Manager เสนอเบิก"; actionLabelEn = "Submitted request"; colorClass = "bg-amber-500";
                                  } else if (log.action === "approved") {
                                    actionLabelTh = "อนุมัติรายการ"; actionLabelEn = "Approved request"; colorClass = "bg-emerald-500";
                                  } else if (log.action === "rejected") {
                                    actionLabelTh = "ปฏิเสธใบเบิก"; actionLabelEn = "Rejected request"; colorClass = "bg-red-500";
                                  } else if (log.action === "disbursed") {
                                    actionLabelTh = "บัญชีโอนเงินแล้ว"; actionLabelEn = "Disbursed funds"; colorClass = "bg-blue-500";
                                  } else if (log.action === "spent") {
                                    actionLabelTh = "Manager จ่ายเงินครบ"; actionLabelEn = "Reported spent"; colorClass = "bg-indigo-500";
                                  } else if (log.action === "closed") {
                                    actionLabelTh = "บัญชีปิดยอดสำเร็จ"; actionLabelEn = "Audited & Closed"; colorClass = "bg-purple-500";
                                  } else if (log.action === "cancelled" || log.action === "deleted") {
                                    actionLabelTh = "ยกเลิกคำขอ"; actionLabelEn = "Cancelled"; colorClass = "bg-surface-400";
                                  }

                                  return (
                                    <div key={log.id} className="relative">
                                      <span className={`absolute -left-[21.5px] top-0.5 w-3.5 h-3.5 rounded-full ${colorClass} border-2 border-white`} />
                                      <div className="font-semibold text-surface-900 flex justify-between">
                                        <span>{t(actionLabelTh, actionLabelEn)}</span>
                                        {log.new_total_approved !== null && (
                                          <span className="text-brand-600 font-bold">{formatMoney(log.new_total_approved, lang)}</span>
                                        )}
                                      </div>
                                      <div className="text-xxs text-surface-400 mt-0.5">
                                        👤 {log.actor_name || t("ระบบ", "System")} • 🕒 {new Date(log.created_at).toLocaleString(lang === "th" ? "th-TH" : "en-US")}
                                      </div>
                                      {log.notes && <div className="text-xxs text-surface-500 mt-1 italic">💬 {log.notes}</div>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2 pt-3">
                            {(selected.status === "pending" || selected.status === "draft") && (
                              <>
                                <button type="button" onClick={() => handleEditClick(selected)} className="flex-1 py-2 px-3 border border-surface-200 rounded-xl text-sm font-semibold hover:bg-surface-50 transition-colors">{t("✏️ แก้ไข", "✏️ Edit")}</button>
                                <button type="button" onClick={() => handleDeleteExpense(selected.id)} className="flex-1 py-2 px-3 bg-red-50 text-red-700 rounded-xl text-sm font-semibold hover:bg-red-100 transition-colors">{t("🗑️ ลบ", "🗑️ Delete")}</button>
                              </>
                            )}

                            {selected.status === "pending" && isPresident && (
                              <>
                                <button type="button" onClick={() => setApprovalAction("approved")} className="flex-1 py-2.5 px-4 bg-brand-500 text-white rounded-xl text-sm font-semibold hover:bg-brand-600 transition-colors">{t("อนุมัติ", "Approve")}</button>
                                <button type="button" onClick={() => setApprovalAction("rejected")} className="flex-1 py-2.5 px-4 bg-red-50 text-red-700 rounded-xl text-sm font-semibold hover:bg-red-100 transition-colors">{t("ปฏิเสธ", "Reject")}</button>
                              </>
                            )}

                            {selected.status === "approved" && isAccountant && (
                              <button type="button" onClick={() => setApprovalAction("disbursed")} className="w-full py-2.5 px-4 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 transition-colors">💵 {t("บันทึกการโอนเงินให้ผู้จัดการ", "Disburse Funds to Manager")}</button>
                            )}

                            {selected.status === "disbursed" && isManager && (
                              <button type="button" onClick={() => setApprovalAction("spent")} className="w-full py-2.5 px-4 bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-600 transition-colors">📝 {t("ส่งรายงานและยืนยันการจ่ายเงินจริง", "Confirm Spending & Submit Report")}</button>
                            )}

                            {selected.status === "spent" && isAccountant && (
                              <button type="button" onClick={() => setApprovalAction("closed")} className="w-full py-2.5 px-4 bg-purple-500 text-white rounded-xl text-sm font-semibold hover:bg-purple-600 transition-colors">🔒 {t("ตรวจสอบผ่านและปิดยอดบัญชี", "Verify & Close Spent Report")}</button>
                            )}
                          </div>

                          {approvalAction && (
                            <form onSubmit={submitApproval} className="mt-4 space-y-3 p-4 bg-surface-50 rounded-xl border border-surface-200">
                              <div className="font-semibold text-sm text-surface-900 border-b pb-1.5 flex justify-between">
                                <span>
                                  {approvalAction === "disbursed"
                                    ? t("💵 บันทึกการโอนเงินให้ผู้จัดการ", "💵 Disburse Funds to Manager")
                                    : approvalAction === "spent"
                                      ? t("📝 รายงานการจ่ายเงินจริงย่อย", "📝 Actual Spent Report")
                                      : approvalAction === "closed"
                                        ? t("🔒 บันทึกผลการตรวจสอบ/ปิดยอด", "🔒 Audit & Close")
                                        : t("📝 ยืนยันการดำเนินการ", "📝 Process Request")
                                  }
                                </span>
                                <button type="button" onClick={() => setApprovalAction(null)} className="text-surface-400">✕</button>
                              </div>

                              {approvalAction === "approved" && (
                                <div className="space-y-3">
                                  <div className="font-semibold text-xs text-surface-400 uppercase tracking-wider">{t("อนุมัติยอดรายคอลัมน์ย่อย (อนุมัติบางส่วนได้)", "Approve amount per item")}</div>
                                  {selected.items?.map((it: any) => (
                                    <div key={it.id} className="p-3 bg-white rounded-lg border border-surface-200 space-y-2 text-xs">
                                      <div className="font-medium text-surface-900 flex justify-between">
                                        <span>{it.description}</span>
                                        <span className="text-surface-400">({t("ตั้งเบิก:", "Request:")} {formatMoney(it.amount_requested, lang)})</span>
                                      </div>
                                      <div>
                                        <label className="block text-xxs font-medium text-surface-400 mb-1">{t("ยอดอนุมัติเงิน (ใส่ 0 หากต้องการไม่อนุมัติยอดนี้)", "Approved amount (Set 0 to Reject)")}</label>
                                        <input name={`approved_amount_${it.id}`} defaultValue={it.amount_requested} className="input-field text-xs text-right" />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {approvalAction === "disbursed" && (
                                <div className="space-y-3">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-xs font-semibold text-surface-500 mb-1">{t("จำนวนเงินโอนจริง", "Disbursed Amount")}</label>
                                      <input name="disbursed_amount" defaultValue={selected.total_approved ? parseFloat(String(selected.total_approved)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""} className="input-field text-sm" onFocus={(e) => { e.target.value = e.target.value.replace(/,/g, ""); }} onBlur={(e) => { const num = parseFloat(e.target.value.replace(/,/g, "")); if (!isNaN(num)) { e.target.value = num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } }} />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-semibold text-surface-500 mb-1">{t("ช่องทางการโอน", "Channel")}</label>
                                      <select name="disbursal_channel" className="input-field text-sm">
                                        <option value="bank_transfer">{t("โอนผ่านธนาคาร", "Bank Transfer")}</option>
                                        <option value="cash">{t("เงินสด", "Cash")}</option>
                                      </select>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-lg border border-dashed border-surface-200">
                                    <div className="flex items-center gap-2 text-xs text-surface-500">
                                      <span>📎 {t("หลักฐานการโอน:", "Receipt Proof:")}</span>
                                      {paymentReceipt ? (
                                        <a href={uatPath(paymentReceipt)} target="_blank" rel="noreferrer" className="text-brand-600 underline font-medium break-all">
                                          {paymentReceipt.split("/").pop()}
                                        </a>
                                      ) : (
                                        <span className="text-amber-600 font-medium">⚠️ {t("กรุณาอัปโหลดหลักฐาน", "Upload proof")}</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {paymentReceipt && (
                                        <button type="button" onClick={() => setPaymentReceipt("")} className="text-xs text-red-500 hover:underline">{t("ลบ", "Remove")}</button>
                                      )}
                                      <label className="cursor-pointer text-xs bg-surface-100 hover:bg-surface-200 px-3 py-2 rounded-lg border font-medium">
                                        {uploadingReceipt ? t("อัปโหลด...", "Uploading...") : t("📁 อัปโหลด", "📁 Upload")}
                                        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) handleUploadPaymentReceipt(file);
                                        }} />
                                      </label>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {approvalAction === "spent" && (
                                <div className="space-y-3">
                                  <div className="font-semibold text-xs text-surface-400 uppercase tracking-wider">{t("รายละเอียดจ่ายจริงแต่ละรายการ (เฉพาะยอดที่อนุมัติ)", "Spent Details per Approved Item")}</div>
                                  {selected.items?.filter((it: any) => it.status !== "rejected").map((it: any) => (
                                    <div key={it.id} className="p-3 bg-white rounded-lg border border-surface-200 space-y-2 text-xs">
                                      <div className="font-medium text-surface-900 flex justify-between">
                                        <span>{it.description}</span>
                                        <span className="text-surface-500">(อนุมัติ: {formatMoney(it.amount_approved || it.amount_requested, lang)})</span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className="block text-xxs font-medium text-surface-400 mb-1">{t("จำนวนเงินจ่ายจริง", "Spent Amount")}</label>
                                          <input name={`actual_spent_${it.id}`} defaultValue={it.amount_approved || it.amount_requested} className="input-field text-xs text-right" />
                                        </div>
                                        <div>
                                          <label className="block text-xxs font-medium text-surface-400 mb-1">{t("วันที่ใช้จ่าย", "Spent Date")}</label>
                                          <input name={`spent_at_${it.id}`} type="date" className="input-field text-xs" />
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-50 p-2 rounded-lg border border-dashed border-surface-200 mt-2">
                                        <div className="flex items-center gap-1.5 text-xxs text-surface-500">
                                          <span>📎 {t("ใบเสร็จ:", "Receipt:")}</span>
                                          {itemReceiptPaths[it.id] || it.receipt_file_path ? (
                                            <a href={uatPath(itemReceiptPaths[it.id] || it.receipt_file_path || "")} target="_blank" rel="noreferrer" className="text-brand-600 underline break-all font-medium">
                                              {(itemReceiptPaths[it.id] || it.receipt_file_path || "").split("/").pop()}
                                            </a>
                                          ) : (
                                            <span className="text-surface-400">({t("ไม่มี", "None")})</span>
                                          )}
                                        </div>
                                        <label className="cursor-pointer text-[10px] bg-white hover:bg-surface-100 px-2 py-1.5 rounded border">
                                          {uploadingItemReceiptIndex === it.id ? t("โหลด...", "Uploading...") : t("📁 ใบเสร็จ", "📁 Upload")}
                                          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleUploadItemReceipt(it.id, file);
                                          }} />
                                        </label>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="space-y-1">
                                <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider">{t("หมายเหตุประกอบรายงาน", "Workflow Notes")}</label>
                                <input name="notes" className="input-field text-sm" placeholder={t("ใส่หมายเหตุเพิ่มเติม...", "Enter notes...")} />
                              </div>

                              <button disabled={saving || (approvalAction === "disbursed" && !paymentReceipt)} className="btn-primary w-full text-sm py-2">
                                {saving ? t("กำลังบันทึก...", "Saving...") : t("ยืนยันบันทึกข้อมูล", "Confirm Action")}
                              </button>
                            </form>
                          )}

                          {selected.status === "approved" && !approvalAction && (
                            <form onSubmit={submitPettySpend} className="mt-4 grid md:grid-cols-3 gap-3 p-4 bg-amber-50/20 border border-amber-200 rounded-xl">
                              <div className="md:col-span-3 font-semibold text-sm text-amber-800">🪙 {t("ใช้จ่ายเงินสดย่อยฉุกเฉิน", "Urgent Petty Cash Spend")}</div>
                              <input name="amount" required className="input-field text-sm" placeholder={t("จำนวนเงิน", "Amount")} onFocus={(e) => { e.target.value = e.target.value.replace(/,/g, ""); }} onBlur={(e) => { const num = parseFloat(e.target.value.replace(/,/g, "")); if (!isNaN(num)) { e.target.value = num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } }} />
                              <input name="description" required className="input-field text-sm md:col-span-2" placeholder={t("รายละเอียดเหตุฉุกเฉิน", "Emergency description")} />
                              <input name="transaction_date" type="date" className="input-field text-sm md:col-span-3" />
                              <button disabled={saving} className="btn-primary md:col-span-3 py-2 text-sm">{t("บันทึกเงินสดย่อยทันที", "Record urgent spend")}</button>
                            </form>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "petty" && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {balances.map((b) => (
              <div key={b.manager_user_id} className="card p-5 border border-surface-200 bg-white">
                <div className="text-sm text-surface-500 font-medium">{b.manager_name || t("ผู้จัดการ", "Manager")}</div>
                <div className="mt-2 text-3xl font-extrabold text-brand-700">{formatMoney(b.current_balance, lang)}</div>
                <div className="text-xs text-surface-400 mt-2">{t("อัปเดตล่าสุด:", "Last updated:")} {formatDate(b.last_transaction_at, lang)}</div>
              </div>
            ))}
            {balances.length === 0 && (
              <div className="card text-center py-12 text-surface-500 md:col-span-3">{t("ยังไม่มีเงินสดย่อยบันทึกไว้ในระบบ", "No petty cash balances found")}</div>
            )}
          </div>
        )}

        {tab === "ledger" && (
          <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto no-scrollbar">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-50 text-surface-500 border-b border-surface-200">
                  <tr>
                    <th className="p-3 text-left font-semibold">{t("วันที่", "Date")}</th>
                    <th className="p-3 text-left font-semibold">{t("ผู้จัดการ", "Manager")}</th>
                    <th className="p-3 text-left font-semibold">{t("ประเภทรายการ", "Type")}</th>
                    <th className="p-3 text-left font-semibold">{t("คำอธิบาย", "Description")}</th>
                    <th className="p-3 text-right font-semibold">{t("จำนวนเงิน", "Amount")}</th>
                    <th className="p-3 text-right font-semibold">{t("ยอดคงเหลือ", "Balance")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {ledger.map((l) => (
                    <tr key={l.id} className="hover:bg-surface-50/50 transition-colors">
                      <td className="p-3">{formatDate(l.transaction_date, lang)}</td>
                      <td className="p-3 font-medium">{l.manager_name || "-"}</td>
                      <td className="p-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xxs font-semibold uppercase tracking-wider ${l.direction === "in" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                          {l.transaction_type}
                        </span>
                      </td>
                      <td className="p-3 text-surface-600 max-w-xs truncate" title={l.description}>{l.description || "-"}</td>
                      <td className={`p-3 text-right font-semibold ${l.direction === "in" ? "text-emerald-600" : "text-red-600"}`}>
                        {l.direction === "in" ? "+" : "-"}{formatMoney(l.amount, lang)}
                      </td>
                      <td className="p-3 text-right font-bold text-surface-800">{formatMoney(l.balance_after, lang)}</td>
                    </tr>
                  ))}
                  {ledger.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-surface-400">{t("ยังไม่มีประวัติเงินสดย่อย", "No petty cash history")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
