"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageContext";
import Toast from "@/components/Toast";
import { DropdownGroups, fetchDropdownGroups, optionText, optionWithIcon } from "@/lib/dropdown-client";

const UAT_BASE_PATH = process.env.NEXT_PUBLIC_UAT_BASE_PATH || "";
const uatPath = (path: string) => `${UAT_BASE_PATH}${path}`;

type Tab = "announcements" | "documents" | "tickets" | "users" | "notifications";

export default function AdminPage() {
  const { lang } = useLanguage();
  const [tab, setTab] = useState<Tab>("announcements");
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [ticketFilter, setTicketFilter] = useState("all");
  const [ticketSearch, setTicketSearch] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [availableRoles, setAvailableRoles] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [dropdownGroups, setDropdownGroups] = useState<DropdownGroups>({});
  const [editingAnnouncement, setEditingAnnouncement] = useState<any | null>(null);
  const [editingDocument, setEditingDocument] = useState<any | null>(null);
  const [editingNotification, setEditingNotification] = useState<any | null>(null);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);

  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const options = (group: string) => dropdownGroups[group] || [];
  const label = (group: string, code?: string | null) => optionText(dropdownGroups, group, code, lang, code || "-");
  const labelIcon = (group: string, code?: string | null) => optionWithIcon(dropdownGroups, group, code, lang, code || "-");

  async function loadAll() {
    setLoading(true);
    setMessage("");
    try {
      const [a, d, tk, u, n, dd] = await Promise.all([
        fetch(uatPath("/api/admin/announcements")).then(r => r.json()),
        fetch(uatPath("/api/admin/documents")).then(r => r.json()),
        fetch(uatPath(`/api/admin/tickets?status=${ticketFilter}${ticketSearch.trim() ? `&q=${encodeURIComponent(ticketSearch.trim())}` : ""}`)).then(r => r.json()),
        fetch(uatPath("/api/admin/users")).then(r => r.json()),
        fetch(uatPath("/api/notifications")).then(r => r.json()),
        fetchDropdownGroups(["announcement_category", "document_category", "ticket_status", "ticket_priority", "notification_type", "problem_category"]),
      ]);
      if (a.error || d.error || tk.error || u.error) setMessage(a.error || d.error || tk.error || u.error);
      setAnnouncements(a.announcements || []);
      setDocuments(d.documents || []);
      setTickets(tk.tickets || []);
      setUsers(u.users || []);
      setAvailableRoles(u.roles || []);
      setNotifications(n.notifications || []);
      setDropdownGroups(dd || {});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => loadAll(), 300);
    return () => window.clearTimeout(timer);
  }, [ticketFilter, ticketSearch]);
  async function upload(file: File, type: string) {
    const form = new FormData();
    form.append("file", file);
    form.append("type", type);
    const res = await fetch(uatPath("/api/admin/upload"), { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data;
  }

  async function submitAnnouncement(e: any) {
    e.preventDefault();
    const formEl = e.currentTarget as HTMLFormElement;
    setLoading(true);
    setMessage("");
    try {
      const f = new FormData(formEl);
      let imagePath = editingAnnouncement?.image_path || "";
      const image = f.get("image") as File;
      if (image && image.size > 0) imagePath = (await upload(image, "announcements")).file_path;
      const payload = {
        title_th: f.get("title_th"), title_en: f.get("title_en"),
        content_th: f.get("content_th"), content_en: f.get("content_en"),
        category: f.get("category"), image_path: imagePath,
        is_pinned: f.get("is_pinned") === "on", is_published: f.get("is_published") === "on",
      };
      const res = await fetch(editingAnnouncement ? uatPath(`/api/admin/announcements/${editingAnnouncement.id}`) : uatPath("/api/admin/announcements"), { method: editingAnnouncement ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      formEl.reset();
      setEditingAnnouncement(null);
      setToast(editingAnnouncement ? t("แก้ไขประกาศเรียบร้อยแล้ว", "Announcement updated successfully") : t("บันทึกประกาศเรียบร้อยแล้ว", "Announcement saved successfully"));
      await loadAll();
    } catch (err: any) { setMessage(err.message); } finally { setLoading(false); }
  }

  async function submitDocument(e: any) {
    e.preventDefault();
    const formEl = e.currentTarget as HTMLFormElement;
    setLoading(true);
    setMessage("");
    try {
      const f = new FormData(formEl);
      const file = f.get("file") as File;
      let up = editingDocument ? {
        file_name: editingDocument.file_name,
        file_path: editingDocument.file_path,
        file_size_bytes: editingDocument.file_size_bytes,
        mime_type: editingDocument.mime_type,
      } : null;
      if (file && file.size > 0) up = await upload(file, "documents");
      if (!up) throw new Error(t("กรุณาเลือกไฟล์", "Please select a file"));
      const payload = {
        title_th: f.get("title_th"), title_en: f.get("title_en"),
        description_th: f.get("description_th"), description_en: f.get("description_en"),
        category: f.get("category"), file_name: up.file_name, file_path: up.file_path,
        file_size_bytes: up.file_size_bytes, mime_type: up.mime_type, is_active: true,
      };
      const res = await fetch(editingDocument ? uatPath(`/api/admin/documents/${editingDocument.id}`) : uatPath("/api/admin/documents"), { method: editingDocument ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      formEl.reset();
      setEditingDocument(null);
      setToast(editingDocument ? t("แก้ไขเอกสารเรียบร้อยแล้ว", "Document updated successfully") : t("บันทึกเอกสารเรียบร้อยแล้ว", "Document saved successfully"));
      await loadAll();
    } catch (err: any) { setMessage(err.message); } finally { setLoading(false); }
  }

  async function submitNotification(e: any) {
    e.preventDefault();
    const formEl = e.currentTarget as HTMLFormElement;
    setLoading(true);
    setMessage("");
    try {
      const f = new FormData(formEl);
      const payload = {
        title_th: f.get("title_th"), title_en: f.get("title_en"),
        message_th: f.get("message_th"), message_en: f.get("message_en"),
        type: f.get("type"), target_url: f.get("target_url"), user_id: f.get("user_id") || null,
      };
      const res = await fetch(editingNotification ? uatPath(`/api/notifications/${editingNotification.id}`) : uatPath("/api/notifications"), { method: editingNotification ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      formEl.reset();
      setEditingNotification(null);
      setToast(editingNotification ? t("แก้ไขแจ้งเตือนเรียบร้อยแล้ว", "Notification updated successfully") : t("บันทึกและส่งแจ้งเตือนเรียบร้อยแล้ว", "Notification saved and sent successfully"));
      await loadAll();
    } catch (err: any) { setMessage(err.message); } finally { setLoading(false); }
  }

  async function deleteItem(kind: "announcements" | "documents", id: string) {
    if (!confirm(t("ยืนยันการลบ?", "Confirm delete?"))) return;
    const res = await fetch(uatPath(`/api/admin/${kind}/${id}`), { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) setMessage(data.error); else {
      setToast(t("ลบข้อมูลเรียบร้อยแล้ว", "Deleted successfully"));
      await loadAll();
    }
  }

  async function saveUserRoles(user: any, roles: string[]) {
    const nextRoles = roles.length > 0 ? roles : ["resident"];
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(uatPath(`/api/admin/users/${user.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: nextRoles, notification_enabled: user.notification_enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setToast(t("บันทึกสิทธิ์ผู้ใช้เรียบร้อยแล้ว", "User roles saved successfully"));
      await loadAll();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleUserRole(user: any, roleCode: string) {
    const currentRoles = new Set<string>(user.roles || [user.role || "resident"]);
    if (currentRoles.has(roleCode)) {
      currentRoles.delete(roleCode);
    } else {
      currentRoles.add(roleCode);
      if (roleCode !== "resident") currentRoles.delete("resident");
    }
    if (currentRoles.size === 0) currentRoles.add("resident");
    if (currentRoles.size > 1 && currentRoles.has("resident")) currentRoles.delete("resident");
    await saveUserRoles(user, Array.from(currentRoles));
  }

  async function updateTicket(e: any, ticketId: string) {
    e.preventDefault();
    const formEl = e.currentTarget as HTMLFormElement;
    setLoading(true);
    setMessage("");
    try {
      const f = new FormData(formEl);
      const payload = {
        status: f.get("status"),
        priority: f.get("priority"),
        assigned_to: f.get("assigned_to"),
        progress_note: f.get("progress_note"),
      };
      const res = await fetch(uatPath(`/api/admin/tickets/${ticketId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setToast(t("อัปเดทข้อมูลเรียบร้อยแล้ว", "Ticket updated successfully"));
      formEl.reset();
      await loadAll();
    } catch (err: any) { setMessage(err.message); } finally { setLoading(false); }
  }

  async function deleteTicket(id: string) {
    if (!confirm(t("ยืนยันการลบรายการปัญหานี้?", "Confirm delete this ticket?"))) return;
    const res = await fetch(uatPath(`/api/admin/tickets/${id}`), { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) setMessage(data.error); else {
      setToast(t("ลบรายการปัญหาเรียบร้อยแล้ว", "Ticket deleted successfully"));
      await loadAll();
    }
  }

  async function editTicketLog(ticketId: string, log: any) {
    const nextNote = window.prompt(t("แก้ไขบันทึกความคืบหน้า", "Edit progress note"), log.note || "");
    if (nextNote === null) return;
    const trimmed = nextNote.trim();
    if (!trimmed) {
      setMessage(t("บันทึกห้ามว่าง", "Note cannot be empty"));
      return;
    }
    const res = await fetch(uatPath(`/api/admin/tickets/${ticketId}/logs/${log.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: trimmed }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error || "Edit failed");
      return;
    }
    setToast(t("แก้ไขบันทึกเรียบร้อยแล้ว", "Progress note updated"));
    await loadAll();
  }

  const tabs: { key: Tab; th: string; en: string; icon: string }[] = [
    { key: "announcements", th: "ประกาศ", en: "Announcements", icon: "📢" },
    { key: "documents", th: "เอกสาร", en: "Documents", icon: "📄" },
    { key: "tickets", th: "ปัญหาร้องเรียน", en: "Tickets", icon: "🎫" },
    { key: "users", th: "ผู้ใช้", en: "Users", icon: "👥" },
    { key: "notifications", th: "แจ้งเตือน", en: "Notifications", icon: "🔔" },
  ];

  return (
    <div className="py-4 space-y-4">
      <Toast message={toast} onClose={() => setToast("")} />
      <div>
        <h1 className="text-xl font-bold text-surface-900">{t("Admin Console", "Admin Console")}</h1>
        <p className="text-sm text-surface-500">{t("จัดการประกาศ เอกสาร ปัญหาร้องเรียน ผู้ใช้ และแจ้งเตือน", "Manage announcements, documents, tickets, users, and notifications")}</p>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
        {tabs.map(x => <button key={x.key} onClick={() => setTab(x.key)} className={`shrink-0 px-3 py-2 rounded-lg text-sm ${tab===x.key ? "bg-brand-500 text-white" : "bg-white border border-surface-200 text-surface-700"}`}>{x.icon} {t(x.th, x.en)}</button>)}
      </div>

      {message && <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">{message}</div>}
      {loading && <div className="text-sm text-surface-500">{t("กำลังดำเนินการ...", "Working...")}</div>}

      {message === "Admin permission required" ? (
        <div className="card text-center py-10">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="font-semibold text-surface-900">{t("ต้องใช้สิทธิ์ผู้ดูแล", "Admin access required")}</h2>
          <p className="text-sm text-surface-500 mt-2">{t("กรุณา login ด้วยบัญชีที่ได้รับสิทธิ์ admin", "Please sign in with an admin account")}</p>
        </div>
      ) : tab === "announcements" && <section className="grid lg:grid-cols-2 gap-4">
        <form key={editingAnnouncement?.id || "new-announcement"} onSubmit={submitAnnouncement} className="card space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">{editingAnnouncement ? t("แก้ไขประกาศ", "Edit Announcement") : t("เพิ่มประกาศ", "Add Announcement")}</h2>
            {editingAnnouncement && <button type="button" onClick={() => setEditingAnnouncement(null)} className="text-xs text-surface-500 hover:text-surface-800">{t("ยกเลิกแก้ไข", "Cancel edit")}</button>}
          </div>
          <input name="title_th" required defaultValue={editingAnnouncement?.title_th || ""} placeholder="หัวข้อภาษาไทย" className="input-field" />
          <input name="title_en" defaultValue={editingAnnouncement?.title_en || ""} placeholder="English title" className="input-field" />
          <textarea name="content_th" required defaultValue={editingAnnouncement?.content_th || ""} placeholder="เนื้อหาภาษาไทย" className="input-field min-h-32" />
          <textarea name="content_en" defaultValue={editingAnnouncement?.content_en || ""} placeholder="English content" className="input-field min-h-20" />
          <select name="category" defaultValue={editingAnnouncement?.category || "general"} className="input-field">{options("announcement_category").map(c => <option key={c.code} value={c.code}>{optionWithIcon(dropdownGroups, "announcement_category", c.code, lang, c.code)}</option>)}</select>
          {editingAnnouncement?.image_path && <p className="text-xs text-surface-500">{t("มีรูปเดิมแล้ว ถ้าต้องการเปลี่ยนให้เลือกไฟล์ใหม่", "Existing image is kept. Choose a new file to replace it.")}</p>}
          <input name="image" type="file" accept="image/*" className="input-field" />
          <label className="flex gap-2 text-sm"><input name="is_pinned" type="checkbox" defaultChecked={Boolean(editingAnnouncement?.is_pinned)} /> {t("ปักหมุด", "Pinned")}</label>
          <label className="flex gap-2 text-sm"><input name="is_published" type="checkbox" defaultChecked={editingAnnouncement ? editingAnnouncement.is_published !== false : true} /> {t("เผยแพร่ทันที", "Publish now")}</label>
          <button className="btn-primary w-full">{editingAnnouncement ? t("บันทึกการแก้ไข", "Save Changes") : t("บันทึก", "Save")}</button>
        </form>
        <div className="space-y-2">{announcements.map(a => <div key={a.id} className="card flex justify-between gap-3"><div><div className="font-medium text-sm">{a.title_th}</div><div className="text-xs text-surface-500">{labelIcon("announcement_category", a.category)} • {a.is_published ? t("เผยแพร่", "published") : t("ฉบับร่าง", "draft")}</div></div><div className="flex gap-3 shrink-0"><button onClick={()=>{ setEditingAnnouncement(a); setTab("announcements"); }} className="text-brand-700 text-sm">{t("แก้ไข", "Edit")}</button><button onClick={()=>deleteItem("announcements", a.id)} className="text-red-600 text-sm">Delete</button></div></div>)}</div>
      </section>}

      {message !== "Admin permission required" && tab === "documents" && <section className="grid lg:grid-cols-2 gap-4">
        <form key={editingDocument?.id || "new-document"} onSubmit={submitDocument} className="card space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">{editingDocument ? t("แก้ไขเอกสาร", "Edit Document") : t("อัปโหลดเอกสาร", "Upload Document")}</h2>
            {editingDocument && <button type="button" onClick={() => setEditingDocument(null)} className="text-xs text-surface-500 hover:text-surface-800">{t("ยกเลิกแก้ไข", "Cancel edit")}</button>}
          </div>
          <input name="title_th" required defaultValue={editingDocument?.title_th || ""} placeholder="ชื่อเอกสารภาษาไทย" className="input-field" />
          <input name="title_en" defaultValue={editingDocument?.title_en || ""} placeholder="English title" className="input-field" />
          <textarea name="description_th" defaultValue={editingDocument?.description_th || ""} placeholder="คำอธิบายภาษาไทย" className="input-field min-h-20" />
          <textarea name="description_en" defaultValue={editingDocument?.description_en || ""} placeholder="English description" className="input-field min-h-20" />
          <select name="category" defaultValue={editingDocument?.category || "rules"} className="input-field">{options("document_category").map(c => <option key={c.code} value={c.code}>{optionWithIcon(dropdownGroups, "document_category", c.code, lang, c.code)}</option>)}</select>
          {editingDocument?.file_name && <p className="text-xs text-surface-500">{t("ไฟล์เดิม", "Current file")}: {editingDocument.file_name} — {t("ถ้าต้องการเปลี่ยนให้เลือกไฟล์ใหม่", "choose a new file to replace it")}</p>}
          <input name="file" required={!editingDocument} type="file" accept=".pdf,.docx,.xlsx,image/*" className="input-field" />
          <button className="btn-primary w-full">{editingDocument ? t("บันทึกการแก้ไข", "Save Changes") : t("อัปโหลด", "Upload")}</button>
        </form>
        <div className="space-y-2">{documents.map(d => <div key={d.id} className="card flex justify-between gap-3"><div><div className="font-medium text-sm">{d.title_th}</div><div className="text-xs text-surface-500">{labelIcon("document_category", d.category)} • {d.file_name}</div></div><div className="flex gap-3 shrink-0"><button onClick={()=>{ setEditingDocument(d); setTab("documents"); }} className="text-brand-700 text-sm">{t("แก้ไข", "Edit")}</button><button onClick={()=>deleteItem("documents", d.id)} className="text-red-600 text-sm">Delete</button></div></div>)}</div>
      </section>}

      {message !== "Admin permission required" && tab === "tickets" && <section className="space-y-4">
        <div className="card flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="font-semibold text-surface-900">{t("จัดการปัญหาร้องเรียน", "Manage Problem Tickets")}</h2>
            <p className="text-xs text-surface-500 mt-1">{t("เปลี่ยนสถานะ มอบหมายผู้รับผิดชอบ และบันทึกผลการแก้ไข", "Update status, assign owner, and record resolution notes")}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 md:w-auto">
            <input
              value={ticketSearch}
              onChange={(e) => setTicketSearch(e.target.value)}
              placeholder={t("ค้นหา Ticket, รายละเอียด, บ้านเลขที่", "Search ticket, description, house")}
              className="input-field md:w-72"
            />
            <select value={ticketFilter} onChange={(e) => setTicketFilter(e.target.value)} className="input-field md:w-48">
              <option value="all">{t("ทุกสถานะ", "All statuses")}</option>
              {options("ticket_status").map(s => <option key={s.code} value={s.code}>{optionText(dropdownGroups, "ticket_status", s.code, lang, s.code)}</option>)}
            </select>
            {ticketSearch && <button type="button" onClick={() => setTicketSearch("")} className="px-4 py-2 rounded-xl border border-surface-200 text-sm text-surface-600 hover:bg-surface-50">{t("ล้าง", "Clear")}</button>}
          </div>
        </div>
        <div className="space-y-3">
          {tickets.length === 0 && <div className="card text-center text-surface-500 text-sm py-8">{t("ไม่มีรายการปัญหา", "No tickets")}</div>}
          {tickets.map(ticket => <div key={ticket.id} className="card space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-mono text-xs text-surface-500">{ticket.ticket_number}</span>
                  <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs">{label("ticket_status", ticket.status)}</span>
                  <span className="px-2 py-0.5 rounded-full bg-surface-100 text-surface-700 text-xs">{label("ticket_priority", ticket.priority)}</span>
                </div>
                <h3 className="font-semibold text-surface-900 text-sm">{ticket.problem_title}</h3>
                {ticket.image_path && <a href={uatPath(`/api/tickets/${ticket.id}/image`)} target="_blank" rel="noreferrer" className="mt-2 block w-32 h-24 rounded-xl overflow-hidden border border-surface-200 bg-surface-50"><img src={uatPath(`/api/tickets/${ticket.id}/image`)} alt={ticket.problem_title} className="w-full h-full object-cover" loading="lazy" /></a>}
                <p className="text-sm text-surface-600 mt-1 whitespace-pre-wrap">{ticket.problem_description}</p>
                <div className="text-xs text-surface-500 mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  <span>{t("บ้านเลขที่", "House")}: {ticket.house_number || "-"}</span>
                  <span>{t("หมวด", "Category")}: {labelIcon("problem_category", ticket.problem_category)}</span>
                  <span>{new Date(ticket.reported_at).toLocaleString(lang === "th" ? "th-TH" : "en-US")}</span>
                </div>
              </div>
              <button onClick={() => deleteTicket(ticket.id)} className="text-red-600 text-sm shrink-0 self-start">Delete</button>
            </div>
            <form onSubmit={(e) => updateTicket(e, ticket.id)} className="grid md:grid-cols-4 gap-2 pt-3 border-t border-surface-100">
              <select name="status" defaultValue={ticket.status} className="input-field">
                {options("ticket_status").map(s => <option key={s.code} value={s.code}>{optionText(dropdownGroups, "ticket_status", s.code, lang, s.code)}</option>)}
              </select>
              <select name="priority" defaultValue={ticket.priority} className="input-field">
                {options("ticket_priority").map(p => <option key={p.code} value={p.code}>{optionText(dropdownGroups, "ticket_priority", p.code, lang, p.code)}</option>)}
              </select>
              <input name="assigned_to" defaultValue={ticket.assigned_to || ""} placeholder={t("ผู้รับผิดชอบ", "Assigned to")} className="input-field" />
              <button className="btn-primary">{t("อัปเดต", "Update")}</button>
              <textarea name="progress_note" placeholder={t("เพิ่มบันทึกความคืบหน้าใหม่ เช่น ดำเนินการติดต่อช่างแล้ว", "Add a new progress note, e.g. technician contacted")} className="input-field md:col-span-4 min-h-20" />
            </form>
            <div className="pt-3 border-t border-surface-100">
              <h4 className="text-xs font-semibold text-surface-700 mb-2">{t("ประวัติความคืบหน้า", "Progress history")}</h4>
              <div className="space-y-2">
                {(ticket.progress_logs || []).length === 0 && <p className="text-xs text-surface-400">{t("ยังไม่มีบันทึกความคืบหน้า", "No progress notes yet")}</p>}
                {(ticket.progress_logs || []).map((log: any) => (
                  <div key={log.id} className="rounded-xl bg-surface-50 border border-surface-100 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-surface-500">
                        <span>{new Date(log.created_at).toLocaleString(lang === "th" ? "th-TH" : "en-US")}</span>
                        {log.created_by_name && <span>• {log.created_by_name}</span>}
                        {log.status && <span className="px-1.5 py-0.5 rounded bg-brand-50 text-brand-700">{label("ticket_status", log.status)}</span>}
                      </div>
                      {log.can_edit && <button type="button" onClick={() => editTicketLog(ticket.id, log)} className="text-xs text-brand-700 hover:underline">{t("แก้ไข", "Edit")}</button>}
                    </div>
                    <p className="text-sm text-surface-700 whitespace-pre-wrap">{log.note}</p>
                    {log.edited_at && <p className="text-[11px] text-surface-400 mt-1">{t("แก้ไขล่าสุด", "Edited")}: {new Date(log.edited_at).toLocaleString(lang === "th" ? "th-TH" : "en-US")} {log.edited_by_name ? `• ${log.edited_by_name}` : ""}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>)}
        </div>
      </section>}

      {message !== "Admin permission required" && tab === "users" && <section className="space-y-3">
        <div className="card flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="font-semibold text-surface-900">{t("จัดการ Role ผู้ใช้", "Manage User Roles")}</h2>
            <p className="text-xs text-surface-500 mt-1">{t("กำหนดสิทธิ์หลาย Role ให้ผู้ใช้ เช่น Admin, Accountant, Manager หรือ Resident", "Assign multiple roles to users, such as Admin, Accountant, Manager, or Resident")}</p>
          </div>
          <div className="text-xs text-surface-500">{t("จำนวนผู้ใช้", "Users")}: {users.length}</div>
        </div>
        {users.map(u => {
          const userRoles = new Set<string>(u.roles || [u.role || "resident"]);
          return (
            <div key={u.id} className="card space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm text-surface-900 break-words">{u.display_name || u.email}</div>
                  <div className="text-xs text-surface-500 break-words">{u.email} {u.house_number ? `• ${t("บ้าน", "House")} ${u.house_number}` : ""}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Array.from(userRoles).map((role) => <span key={role} className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs">{role}</span>)}
                  </div>
                </div>
                <div className="text-xs text-surface-500 shrink-0 lg:text-right">
                  <div>{t("Legacy role", "Legacy role")}: {u.role || "resident"}</div>
                  <div>{u.notification_enabled ? t("รับแจ้งเตือน", "Notifications on") : t("ปิดแจ้งเตือน", "Notifications off")}</div>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-3 border-t border-surface-100">
                {availableRoles.map((role) => {
                  const checked = userRoles.has(role.role_code);
                  return (
                    <button
                      key={role.role_code}
                      type="button"
                      disabled={loading}
                      onClick={() => toggleUserRole(u, role.role_code)}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left transition-colors ${checked ? "bg-brand-50 border-brand-200 text-brand-700" : "bg-white border-surface-200 text-surface-600 hover:bg-surface-50"}`}
                    >
                      <span>
                        <span className="block text-sm font-medium">{lang === "th" ? role.role_name_th : role.role_name_en}</span>
                        <span className="block text-xs opacity-70">{role.role_code}</span>
                      </span>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${checked ? "bg-brand-500 text-white" : "bg-surface-100 text-surface-400"}`}>{checked ? "✓" : "+"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>}

      {message !== "Admin permission required" && tab === "notifications" && <section className="grid lg:grid-cols-2 gap-4">
        <form key={editingNotification?.id || "new-notification"} onSubmit={submitNotification} className="card space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">{editingNotification ? t("แก้ไขแจ้งเตือน", "Edit Notification") : t("ส่งแจ้งเตือน", "Send Notification")}</h2>
            {editingNotification && <button type="button" onClick={() => setEditingNotification(null)} className="text-xs text-surface-500 hover:text-surface-800">{t("ยกเลิกแก้ไข", "Cancel edit")}</button>}
          </div>
          <input name="title_th" required defaultValue={editingNotification?.title_th || ""} placeholder="หัวข้อภาษาไทย" className="input-field" />
          <input name="title_en" defaultValue={editingNotification?.title_en || ""} placeholder="English title" className="input-field" />
          <textarea name="message_th" required defaultValue={editingNotification?.message_th || ""} placeholder="ข้อความภาษาไทย" className="input-field min-h-20" />
          <textarea name="message_en" defaultValue={editingNotification?.message_en || ""} placeholder="English message" className="input-field min-h-20" />
          <select name="type" defaultValue={editingNotification?.type || "general"} className="input-field">{options("notification_type").map(tp => <option key={tp.code} value={tp.code}>{optionText(dropdownGroups, "notification_type", tp.code, lang, tp.code)}</option>)}</select>
          <input name="target_url" defaultValue={editingNotification?.target_url || ""} placeholder="/announcements" className="input-field" />
          <select name="user_id" defaultValue={editingNotification?.user_id || ""} className="input-field"><option value="">{t("ส่งถึงทุกคน", "All users")}</option>{users.map(u => <option key={u.id} value={u.id}>{u.display_name || u.email}</option>)}</select>
          <button className="btn-primary w-full">{editingNotification ? t("บันทึกการแก้ไข", "Save Changes") : t("ส่ง", "Send")}</button>
        </form>
        <div className="space-y-2">{notifications.map(n => <div key={n.id} className="card"><div className="flex justify-between gap-3"><div><div className="font-medium text-sm">{n.title_th}</div><div className="text-xs text-surface-500">{label("notification_type", n.type)} • {new Date(n.created_at).toLocaleString(lang === "th" ? "th-TH" : "en-US")}</div></div><button onClick={()=>{ setEditingNotification(n); setTab("notifications"); }} className="text-brand-700 text-sm shrink-0">{t("แก้ไข", "Edit")}</button></div><p className="text-sm mt-2">{n.message_th}</p></div>)}</div>
      </section>}
    </div>
  );
}
