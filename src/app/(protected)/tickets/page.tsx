"use client";

import { Fragment, useEffect, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { useLanguage } from "@/components/LanguageContext";
import { DropdownGroups, fetchDropdownGroups, optionClass, optionText, optionWithIcon } from "@/lib/dropdown-client";

const validStatuses = new Set(["all", "received", "in_progress", "resolved", "closed"]);

const UAT_BASE_PATH = process.env.NEXT_PUBLIC_UAT_BASE_PATH || "";

const uatPath = (path: string) => `${UAT_BASE_PATH}${path}`;

function getInitialStatusFilter() {
  if (typeof window === "undefined") return "all";
  const status = new URLSearchParams(window.location.search).get("status") || "all";
  return validStatuses.has(status) ? status : "all";
}

export default function TicketsPage() {
  const { lang } = useLanguage();
  const [tickets, setTickets] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [statusFilter, setStatusFilter] = useState(getInitialStatusFilter);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dropdownGroups, setDropdownGroups] = useState<DropdownGroups>({});

  useEffect(() => {
    const queryStatus = getInitialStatusFilter();
    setStatusFilter(queryStatus);
  }, []);

  useEffect(() => {
    fetchDropdownGroups(["ticket_status", "ticket_priority", "problem_category"])
      .then(setDropdownGroups)
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(statusFilter === "all" ? uatPath("/api/tickets") : uatPath(`/api/tickets?status=${statusFilter}`))
      .then((r) => r.json())
      .then((d) => { setTickets(d.tickets || []); setStats(d.stats || {}); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const label = (group: string, code?: string | null) => optionText(dropdownGroups, group, code, lang, code || "-");
  const labelIcon = (group: string, code?: string | null) => optionWithIcon(dropdownGroups, group, code, lang, code || "-");
  const statusOptions = [
    { code: "all", label: t("ทั้งหมด", "All") },
    ...(dropdownGroups.ticket_status || [
      { code: "received", label_th: "รับเรื่องแล้ว", label_en: "Received" },
      { code: "in_progress", label_th: "กำลังดำเนินการ", label_en: "In Progress" },
      { code: "resolved", label_th: "แก้ไขแล้ว", label_en: "Resolved" },
      { code: "closed", label_th: "ปิดงานแล้ว", label_en: "Closed" },
    ]).map((opt) => ({ code: opt.code, label: optionText({ ticket_status: dropdownGroups.ticket_status || [] }, "ticket_status", opt.code, lang, opt.code) })),
  ];
  const formatDate = (d: string) => new Date(d).toLocaleString(lang === "th" ? "th-TH" : "en-US", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const DetailPanel = ({ ticket }: { ticket: any }) => (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <div><strong>{t("รายละเอียด", "Description")}:</strong><p className="mt-1 text-surface-600 whitespace-pre-wrap">{ticket.problem_description}</p></div>
        <div className="space-y-1 text-surface-600">
          <p><strong className="text-surface-800">{t("บ้านเลขที่", "House #")}:</strong> {ticket.house_number || "-"} {ticket.unit_number && `| Unit: ${ticket.unit_number}`}</p>
          <p><strong className="text-surface-800">{t("หมวดหมู่", "Category")}:</strong> {labelIcon("problem_category", ticket.problem_category)}</p>
          <p><strong className="text-surface-800">{t("ผู้รับผิดชอบ", "Assigned to")}:</strong> {ticket.assigned_to || "-"}</p>
          {ticket.resolved_at && <p><strong className="text-surface-800">{t("วันที่เสร็จ", "Resolved at")}:</strong> {formatDate(ticket.resolved_at)}</p>}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-surface-900 mb-3">{t("ประวัติความคืบหน้า", "Progress timeline")}</h4>
        <div className="space-y-3">
          {(ticket.progress_logs || []).length === 0 && <div className="text-sm text-surface-400 bg-white rounded-xl border border-surface-200 p-3">{t("ยังไม่มีบันทึกความคืบหน้า", "No progress notes yet")}</div>}
          {(ticket.progress_logs || []).map((log: any, idx: number) => (
            <div key={log.id} className="relative pl-5">
              <div className="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full bg-brand-500" />
              {idx < (ticket.progress_logs || []).length - 1 && <div className="absolute left-1 top-4 bottom-[-12px] w-px bg-surface-200" />}
              <div className="rounded-xl bg-white border border-surface-200 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-surface-500 mb-1">
                  <span>{formatDate(log.created_at)}</span>
                  {log.status && <span className="px-1.5 py-0.5 rounded bg-brand-50 text-brand-700">{label("ticket_status", log.status)}</span>}
                  {log.priority && <span className="px-1.5 py-0.5 rounded bg-surface-100 text-surface-700">{label("ticket_priority", log.priority)}</span>}
                  {log.assigned_to && <span>• {t("ผู้รับผิดชอบ", "Assigned")}: {log.assigned_to}</span>}
                </div>
                <p className="text-sm text-surface-700 whitespace-pre-wrap">{log.note}</p>
                {log.edited_at && <p className="text-[11px] text-surface-400 mt-1">{t("แก้ไขล่าสุด", "Edited")}: {formatDate(log.edited_at)} {log.edited_by_name ? `• ${log.edited_by_name}` : ""}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <h1 className="text-2xl font-bold text-surface-900 mb-1">{t("รายการปัญหาร้องเรียน", "Problem Tickets")}</h1>
      <p className="text-sm text-surface-500 mb-6">{t("คลิกแต่ละรายการเพื่อดูรายละเอียดและความคืบหน้า", "Click each ticket to view details and progress timeline")}</p>

      <div className="flex flex-wrap gap-2 mb-6">
        {statusOptions.map((opt) => {
          const count = opt.code === "all" ? Object.values(stats).reduce((a: number, b: any) => a + b, 0) : (stats[opt.code] || 0);
          return (
            <button key={opt.code} onClick={() => {
                setStatusFilter(opt.code);
                const nextUrl = opt.code === "all" ? uatPath("/tickets") : uatPath(`/tickets?status=${opt.code}`);
                window.history.replaceState(null, "", nextUrl);
              }} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${statusFilter === opt.code ? "bg-brand-500 text-white" : "bg-white border border-surface-200 text-surface-600 hover:bg-surface-50"}`}>
              {opt.label} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-12 text-surface-500">{t("กำลังโหลด...", "Loading...")}</div>
      ) : (
        <>
          <div className="hidden md:block bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-50 text-surface-600 font-medium text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">{t("เลขที่", "Ticket #")}</th>
                  <th className="px-4 py-3">{t("วันที่", "Date")}</th>
                  <th className="px-4 py-3">{t("หัวข้อ", "Title")}</th>
                  <th className="px-4 py-3">{t("หมวดหมู่", "Category")}</th>
                  <th className="px-4 py-3">{t("สถานะ", "Status")}</th>
                  <th className="px-4 py-3">{t("ความสำคัญ", "Priority")}</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <Fragment key={ticket.id}>
                    <tr className="bg-white border-t border-surface-200 hover:bg-surface-50 cursor-pointer transition-colors" onClick={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}>
                      <td className="px-4 py-4 font-mono text-xs">{ticket.ticket_number}</td>
                      <td className="px-4 py-4 text-surface-600">{formatDate(ticket.reported_at)}</td>
                      <td className="px-4 py-4 font-medium text-surface-800">{ticket.problem_title}</td>
                      <td className="px-4 py-4 text-surface-600">{labelIcon("problem_category", ticket.problem_category)}</td>
                      <td className="px-4 py-4"><StatusBadge status={ticket.status} groups={dropdownGroups} /></td>
                      <td className="px-4 py-4"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${optionClass(dropdownGroups, "ticket_priority", ticket.priority, "bg-surface-200 text-surface-600")}`}>{label("ticket_priority", ticket.priority)}</span></td>
                    </tr>
                    {expandedId === ticket.id && <tr><td colSpan={6} className="px-6 py-4 bg-surface-50 border-t border-surface-200"><DetailPanel ticket={ticket} /></td></tr>}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="bg-white rounded-2xl border border-surface-200 shadow-sm p-4" onClick={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}>
                <div className="flex items-start justify-between mb-2">
                  <span className="font-mono text-xs text-surface-500">{ticket.ticket_number}</span>
                  <StatusBadge status={ticket.status} groups={dropdownGroups} />
                </div>
                <h3 className="font-medium text-surface-800 text-sm mb-1">{ticket.problem_title}</h3>
                <div className="flex items-center gap-2 text-xs text-surface-500">
                  <span>{formatDate(ticket.reported_at)}</span><span>•</span>
                  <span className={`px-2 py-0.5 rounded-full ${optionClass(dropdownGroups, "ticket_priority", ticket.priority, "bg-surface-200 text-surface-600")}`}>{label("ticket_priority", ticket.priority)}</span>
                </div>
                {expandedId === ticket.id && <div className="mt-4 pt-4 border-t border-surface-100"><DetailPanel ticket={ticket} /></div>}
              </div>
            ))}
          </div>
          {tickets.length === 0 && <div className="text-center py-12 text-surface-500">{t("ไม่มีรายการ", "No tickets")}</div>}
        </>
      )}
    </>
  );
}
