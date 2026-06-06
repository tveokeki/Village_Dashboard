"use client";

const statusMeta: Record<string, { th: string; en: string; className: string }> = {
  paid: { th: "ชำระแล้ว", en: "Paid", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  confirmed: { th: "ยืนยันแล้ว", en: "Confirmed", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  pending: { th: "รอดำเนินการ", en: "Pending", className: "bg-amber-100 text-amber-800 border-amber-200" },
  overdue: { th: "เกินกำหนด", en: "Overdue", className: "bg-red-100 text-red-800 border-red-200" },
  waived: { th: "ยกเว้น", en: "Waived", className: "bg-blue-100 text-blue-800 border-blue-200" },
  cancelled: { th: "ยกเลิก", en: "Cancelled", className: "bg-surface-200 text-surface-700 border-surface-300" },
  approved: { th: "อนุมัติแล้ว", en: "Approved", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  rejected: { th: "ไม่อนุมัติ", en: "Rejected", className: "bg-red-100 text-red-800 border-red-200" },
  reconciled: { th: "กระทบยอดแล้ว", en: "Reconciled", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  unreconciled: { th: "รอกระทบยอด", en: "Unreconciled", className: "bg-amber-100 text-amber-800 border-amber-200" },
};

export default function FinanceStatusBadge({ status, lang }: { status?: string | boolean | null; lang: "th" | "en" }) {
  const key = typeof status === "boolean" ? (status ? "reconciled" : "unreconciled") : String(status || "pending");
  const meta = statusMeta[key] || { th: key, en: key, className: "bg-surface-100 text-surface-700 border-surface-200" };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${meta.className}`}>{lang === "th" ? meta.th : meta.en}</span>;
}
