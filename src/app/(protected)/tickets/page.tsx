"use client";

import { Fragment, useEffect, useState, useMemo } from "react";
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

function getInitialTicketQuery() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return (params.get("ticket") || params.get("q") || "").trim();
}

export default function TicketsPage() {
  const { lang } = useLanguage();
  const [tickets, setTickets] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [statusFilter, setStatusFilter] = useState(getInitialStatusFilter);
  const [searchTerm, setSearchTerm] = useState(getInitialTicketQuery);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dropdownGroups, setDropdownGroups] = useState<DropdownGroups>({});
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  });
  const [toDate, setToDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [currentPage, setCurrentPage] = useState(1);

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const dateStr = ticket.reported_at ? new Date(ticket.reported_at).toISOString().split("T")[0] : "";
      return dateStr >= fromDate && dateStr <= toDate;
    });
  }, [tickets, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / 10));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [filteredTickets, totalPages, currentPage]);

  const paginatedTickets = useMemo(() => {
    const start = (currentPage - 1) * 10;
    return filteredTickets.slice(start, start + 10);
  }, [filteredTickets, currentPage]);

  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const label = (group: string, code?: string | null) => optionText(dropdownGroups, group, code, lang, code || "-");
  const labelIcon = (group: string, code?: string | null) => optionWithIcon(dropdownGroups, group, code, lang, code || "-");
  const options = (group: string) => dropdownGroups[group] || [];

  const fetchTickets = async (filter = statusFilter, query = searchTerm) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      if (query.trim()) params.set("q", query.trim());
      const qs = params.toString();
      const url = uatPath(`/api/tickets${qs ? `?${qs}` : ""}`);
      const d = await fetch(url).then((r) => r.json());
      setTickets(d.tickets || []);
      setStats(d.stats || {});
    } catch (err) {
      console.error(err);
      setMessage(t("โหลดรายการปัญหาไม่สำเร็จ", "Failed to load tickets"));
    } finally {
      setLoading(false);
    }
  };

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
    const timer = window.setTimeout(() => fetchTickets(statusFilter, searchTerm), 300);
    return () => window.clearTimeout(timer);
  }, [statusFilter, searchTerm]);

  useEffect(() => {
    const requestedTicket = getInitialTicketQuery().toUpperCase();
    if (!requestedTicket || tickets.length === 0) return;
    const match = tickets.find((ticket) => String(ticket.ticket_number || "").toUpperCase() === requestedTicket);
    if (match) setExpandedId(match.id);
  }, [tickets]);

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

  async function submitTicket(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setMessage("");
    const form = e.currentTarget;
    const data = new FormData(form);
    try {
      const res = await fetch(uatPath("/api/tickets"), { method: "POST", body: data });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || d.details || "Create ticket failed");
      form.reset();
      setCreateOpen(false);
      setMessage(t(`บันทึกรายการปัญหา ${d.ticket?.ticket_number || ""} เรียบร้อย`, `Ticket ${d.ticket?.ticket_number || ""} created successfully`));
      await fetchTickets("all");
      setStatusFilter("all");
      window.history.replaceState(null, "", uatPath(`/tickets?ticket=${encodeURIComponent(d.ticket?.ticket_number || "")}`));
    } catch (err: any) {
      setMessage(err.message || t("บันทึกไม่สำเร็จ", "Save failed"));
    } finally {
      setCreating(false);
    }
  }

  const DetailPanel = ({ ticket }: { ticket: any }) => (
    <div className="space-y-4">
      {ticket.image_path && (
        <div>
          <h4 className="text-sm font-semibold text-surface-900 mb-2">{t("รูปภาพประกอบ", "Attached image")}</h4>
          {ticket.image_available === false ? (
            <div className="text-sm text-surface-400 bg-white rounded-xl border border-surface-200 p-3">{t("ไม่พบไฟล์รูปภาพ", "Image file not available")}</div>
          ) : (
            <a href={uatPath(`/api/tickets/${ticket.id}/image`)} target="_blank" rel="noreferrer" className="block w-full max-w-xl overflow-hidden rounded-2xl border border-surface-200 bg-white">
              <img src={uatPath(`/api/tickets/${ticket.id}/image`)} alt={ticket.problem_title} className="w-full max-h-96 object-contain bg-surface-50" loading="lazy" />
            </a>
          )}
        </div>
      )}
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
                  {log.status && <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${optionClass(dropdownGroups, "ticket_status", log.status, "bg-surface-100 text-surface-700")}`}>{label("ticket_status", log.status)}</span>}
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
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 mb-1">{t("รายการปัญหาร้องเรียน", "Problem Tickets")}</h1>
          <p className="text-sm text-surface-500">{t("คลิกแต่ละรายการเพื่อดูรายละเอียด ความคืบหน้า และรูปภาพประกอบ", "Click each ticket to view details, progress, and attached images")}</p>
        </div>
        <button onClick={() => setCreateOpen(!createOpen)} className="btn-primary shrink-0">{createOpen ? t("ปิดฟอร์ม", "Close form") : t("+ แจ้งปัญหาใหม่", "+ New ticket")}</button>
      </div>

      {message && <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${message.includes("failed") || message.includes("ไม่สำเร็จ") || message.includes("required") ? "bg-red-50 border-red-200 text-red-700" : "bg-brand-50 border-brand-100 text-brand-700"}`}>{message}</div>}

      {createOpen && (
        <form onSubmit={submitTicket} className="card space-y-3 mb-6">
          <h2 className="font-semibold text-surface-900">{t("แจ้งปัญหาใหม่", "Create a new problem ticket")}</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <input name="house_number" placeholder={t("บ้านเลขที่", "House number")} className="input-field" />
            <input name="unit_number" placeholder={t("ยูนิต/รายละเอียดที่ตั้ง", "Unit/location detail")} className="input-field" />
            <select name="problem_category" defaultValue="other" className="input-field">
              {(options("problem_category").length ? options("problem_category") : [{ code: "other", label_th: "อื่น ๆ", label_en: "Other" }]).map(c => <option key={c.code} value={c.code}>{optionWithIcon(dropdownGroups, "problem_category", c.code, lang, c.code)}</option>)}
            </select>
            <select name="priority" defaultValue="medium" className="input-field">
              {(options("ticket_priority").length ? options("ticket_priority") : [
                { code: "low", label_th: "ต่ำ", label_en: "Low" },
                { code: "medium", label_th: "ปานกลาง", label_en: "Medium" },
                { code: "high", label_th: "สูง", label_en: "High" },
                { code: "urgent", label_th: "เร่งด่วน", label_en: "Urgent" },
              ]).map(p => <option key={p.code} value={p.code}>{optionText(dropdownGroups, "ticket_priority", p.code, lang, p.code)}</option>)}
            </select>
          </div>
          <input name="problem_title" required maxLength={200} placeholder={t("หัวข้อปัญหา", "Problem title")} className="input-field" />
          <textarea name="problem_description" required placeholder={t("อธิบายรายละเอียดปัญหา", "Describe the problem")} className="input-field min-h-28" />
          <div>
            <label className="text-sm font-medium text-surface-700 mb-1 block">{t("แนบรูปภาพประกอบ", "Attach image")}</label>
            <input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="input-field" />
            <p className="text-xs text-surface-400 mt-1">{t("รองรับ JPG, PNG, WEBP, GIF ขนาดไม่เกิน 8MB", "JPG, PNG, WEBP, GIF up to 8MB")}</p>
          </div>
          <button disabled={creating} className="btn-primary w-full disabled:opacity-60">{creating ? t("กำลังบันทึก...", "Saving...") : t("ส่งรายการปัญหา", "Submit ticket")}</button>
        </form>
      )}

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

      <div className="card mb-6">
        <label className="block text-sm font-medium text-surface-700 mb-2">{t("ค้นหารายการปัญหา", "Search tickets")}</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("ค้นหาจากเลขที่ Ticket, รายละเอียด หรือบ้านเลขที่", "Search by ticket number, description, or house number")}
            className="input-field flex-1"
          />
          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm("")} className="px-4 py-2 rounded-xl border border-surface-200 text-sm text-surface-600 hover:bg-surface-50">
              {t("ล้าง", "Clear")}
            </button>
          )}
        </div>
      </div>

      {/* Date Filters */}
      <div className="bg-white p-4 rounded-3xl border border-surface-200 shadow-sm grid grid-cols-2 gap-3 mb-6">
        <div>
          <label className="block text-xs font-medium text-surface-500 mb-1">{t("ตั้งแต่วันที่", "From Date")}</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3.5 py-2.5 bg-surface-50 border border-surface-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-semibold"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-500 mb-1">{t("ถึงวันที่", "To Date")}</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3.5 py-2.5 bg-surface-50 border border-surface-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-semibold"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-surface-500">{t("กำลังโหลด...", "Loading...")}</div>
      ) : (
        <>
          {filteredTickets.length === 0 ? <div className="text-center py-12 text-surface-500">{t("ไม่มีรายการปัญหาร้องเรียนในช่วงเวลาที่เลือก", "No tickets in selected date range")}</div> : (
          <>
          <div className="hidden md:block bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-50 text-surface-600 font-medium text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">{t("เลขที่", "Ticket #")}</th>
                  <th className="px-4 py-3">{t("วันที่", "Date")}</th>
                  <th className="px-4 py-3">{t("รูป", "Image")}</th>
                  <th className="px-4 py-3">{t("หัวข้อ", "Title")}</th>
                  <th className="px-4 py-3">{t("หมวดหมู่", "Category")}</th>
                  <th className="px-4 py-3">{t("สถานะ", "Status")}</th>
                  <th className="px-4 py-3">{t("ความสำคัญ", "Priority")}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTickets.map((ticket) => (
                  <Fragment key={ticket.id}>
                    <tr className="bg-white border-t border-surface-200 hover:bg-surface-50 cursor-pointer transition-colors" onClick={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}>
                      <td className="px-4 py-4 font-mono text-xs">{ticket.ticket_number}</td>
                      <td className="px-4 py-4 text-surface-600">{formatDate(ticket.reported_at)}</td>
                      <td className="px-4 py-4">{ticket.image_path ? <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-surface-100 text-lg">🖼️</span> : <span className="text-surface-300">-</span>}</td>
                      <td className="px-4 py-4 font-medium text-surface-800">{ticket.problem_title}</td>
                      <td className="px-4 py-4 text-surface-600">{labelIcon("problem_category", ticket.problem_category)}</td>
                      <td className="px-4 py-4"><StatusBadge status={ticket.status} groups={dropdownGroups} /></td>
                      <td className="px-4 py-4"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${optionClass(dropdownGroups, "ticket_priority", ticket.priority, "bg-surface-200 text-surface-600")}`}>{label("ticket_priority", ticket.priority)}</span></td>
                    </tr>
                    {expandedId === ticket.id && <tr><td colSpan={7} className="px-6 py-4 bg-surface-50 border-t border-surface-200"><DetailPanel ticket={ticket} /></td></tr>}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {paginatedTickets.map((ticket) => (
              <div key={ticket.id} className="bg-white rounded-2xl border border-surface-200 shadow-sm p-4" onClick={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}>
                <div className="flex items-start justify-between mb-2">
                  <span className="font-mono text-xs text-surface-500">{ticket.ticket_number}</span>
                  <StatusBadge status={ticket.status} groups={dropdownGroups} />
                </div>
                <div className="flex gap-3">
                  {ticket.image_path && <div className="w-16 h-16 rounded-xl bg-surface-100 border border-surface-200 overflow-hidden shrink-0"><img src={uatPath(`/api/tickets/${ticket.id}/image`)} alt="" className="w-full h-full object-cover" loading="lazy" /></div>}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-surface-800 text-sm mb-1 break-words">{ticket.problem_title}</h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-surface-500">
                      <span>{formatDate(ticket.reported_at)}</span><span>•</span>
                      <span className={`px-2 py-0.5 rounded-full ${optionClass(dropdownGroups, "ticket_priority", ticket.priority, "bg-surface-200 text-surface-600")}`}>{label("ticket_priority", ticket.priority)}</span>
                    </div>
                  </div>
                </div>
                {expandedId === ticket.id && <div className="mt-4 pt-4 border-t border-surface-100"><DetailPanel ticket={ticket} /></div>}
              </div>
            ))}
          </div>
          {tickets.length === 0 && <div className="text-center py-12 text-surface-500">{t("ไม่มีรายการ", "No tickets")}</div>}
          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-surface-200 bg-transparent">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-4 py-2 border border-surface-200 rounded-xl text-xs font-semibold bg-white text-surface-600 hover:bg-surface-50 disabled:opacity-50 transition-colors"
              >
                {t("ก่อนหน้า", "Previous")}
              </button>
              <span className="text-xs text-surface-500 font-medium">
                {t(`หน้า ${currentPage} จาก ${totalPages}`, `Page ${currentPage} of ${totalPages}`)}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-4 py-2 border border-surface-200 rounded-xl text-xs font-semibold bg-white text-surface-600 hover:bg-surface-50 disabled:opacity-50 transition-colors"
              >
                {t("ถัดไป", "Next")}
              </button>
            </div>
          )}
          </>
          )}
        </>
      )}
    </>
  );
}
