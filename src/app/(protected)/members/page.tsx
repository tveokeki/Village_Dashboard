"use client";

import { useEffect, useMemo, useState } from "react";
import FinancePageHeader from "@/components/finance/FinancePageHeader";
import KpiCard from "@/components/finance/KpiCard";
import { formatMoney, numberValue, uatPath } from "@/components/finance/finance-format";
import { useLanguage } from "@/components/LanguageContext";

type MemberForm = {
  id?: string;
  house_number: string;
  owner_name: string;
  phone: string;
  email: string;
  line_id: string;
  member_status: string;
  land_type: string;
  area: string;
  land_count: string;
  maintenance_fee: string;
  notes: string;
};

const emptyForm: MemberForm = {
  house_number: "",
  owner_name: "",
  phone: "",
  email: "",
  line_id: "",
  member_status: "active",
  land_type: "",
  area: "",
  land_count: "",
  maintenance_fee: "",
  notes: "",
};

export default function MembersPage() {
  const { lang } = useLanguage();
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const [members, setMembers] = useState<any[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [filters, setFilters] = useState({ q: "", status: "all" });

  async function loadMembers() {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams();
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.status !== "all") params.set("status", filters.status);
    try {
      const res = await fetch(uatPath(`/api/finance/members?${params.toString()}`), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load members");
      setMembers(data.members || []);
      setStats(data.stats || []);
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { const timer = window.setTimeout(loadMembers, 250); return () => window.clearTimeout(timer); }, [filters]);

  const totals = useMemo(() => {
    const byStatus: Record<string, any> = {};
    stats.forEach((s) => { byStatus[s.status] = s; });
    return {
      active: byStatus.active || {},
      inactive: byStatus.inactive || {},
      suspended: byStatus.suspended || {},
      count: stats.reduce((sum, s) => sum + numberValue(s.count), 0),
      totalFee: stats.reduce((sum, s) => sum + numberValue(s.total_maintenance_fee), 0),
    };
  }, [stats]);

  function editMember(member: any) {
    const c = member.contact_info || {};
    setForm({
      id: member.id,
      house_number: member.house_number || "",
      owner_name: member.owner_name || "",
      phone: c.phone || "",
      email: c.email || "",
      line_id: c.line_id || "",
      member_status: member.member_status || "active",
      land_type: member.land_type || "",
      area: member.area ? String(member.area) : "",
      land_count: member.land_count ? String(member.land_count) : "",
      maintenance_fee: member.maintenance_fee ? String(member.maintenance_fee) : "",
      notes: member.notes || "",
    });
    setShowForm(true);
    setMessage("");
    setSuccess("");
  }

  function startCreate() {
    setForm(emptyForm);
    setShowForm(true);
    setMessage("");
    setSuccess("");
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setSuccess("");
    try {
      const res = await fetch(uatPath("/api/finance/members"), {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSuccess(form.id ? t("บันทึกข้อมูลสมาชิกเรียบร้อย", "Member updated") : t("เพิ่มสมาชิกเรียบร้อย", "Member added"));
      setShowForm(false);
      setForm(emptyForm);
      await loadMembers();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(member: any) {
    if (!window.confirm(t(`ยืนยันลบสมาชิกบ้าน ${member.house_number}?`, `Delete member house ${member.house_number}?`))) return;
    setSaving(true);
    setMessage("");
    setSuccess("");
    try {
      const res = await fetch(uatPath(`/api/finance/members?id=${encodeURIComponent(member.id)}`), { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setSuccess(t("ลบสมาชิกเรียบร้อย", "Member deleted"));
      await loadMembers();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  const input = "input-field";
  const label = "block text-xs font-medium text-surface-600 mb-1";
  const landTypeOptions = [
    { value: "บ้านอยู่อาศัย", label: t("บ้านอยู่อาศัย", "Residential house") },
    { value: "ที่ดินเปล่า", label: t("ที่ดินเปล่า", "Vacant land") },
  ];
  const landTypeLabel = (value: any) => value || t("ไม่ระบุประเภทที่ดิน", "No land type");

  return (
    <div className="py-6 min-w-0">
      <FinancePageHeader title={t("สมาชิก", "Members")} description={t("จัดการรายชื่อสมาชิก ข้อมูลแปลง และยอดค่าส่วนกลาง", "Manage member records, land details, and maintenance fees")}>
        <button onClick={startCreate} className="btn-primary w-full sm:w-auto">+ {t("เพิ่มสมาชิก", "Add member")}</button>
      </FinancePageHeader>

      {message && <div className="mb-4 rounded-xl border px-4 py-3 text-sm bg-red-50 border-red-200 text-red-700">{message}</div>}
      {success && <div className="mb-4 rounded-xl border px-4 py-3 text-sm bg-brand-50 border-brand-100 text-brand-700">{success}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label={t("สมาชิกทั้งหมด", "Total members")} value={totals.count} hint={t("ไม่รวมรายการที่ลบ", "Excluding deleted")} />
        <KpiCard label={t("ใช้งาน", "Active")} value={totals.active.count || 0} hint={formatMoney(totals.active.total_maintenance_fee, lang)} tone="emerald" />
        <KpiCard label={t("ไม่ใช้งาน", "Inactive")} value={totals.inactive.count || 0} hint={formatMoney(totals.inactive.total_maintenance_fee, lang)} tone="amber" />
        <KpiCard label={t("ค่าส่วนกลางรวม", "Total fees")} value={formatMoney(totals.totalFee, lang)} hint={t("ต่อรอบตามข้อมูลสมาชิก", "Per period from member data")} />
      </div>

      <div className="card mb-6">
        <div className="grid md:grid-cols-4 gap-3">
          <input className="input-field md:col-span-2" placeholder={t("ค้นหาบ้าน/เจ้าของ/โทร/LINE", "Search house/owner/phone/LINE")} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <select className="input-field" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="all">{t("ทุกสถานะ", "All statuses")}</option>
            <option value="active">{t("ใช้งาน", "Active")}</option>
            <option value="inactive">{t("ไม่ใช้งาน", "Inactive")}</option>
            <option value="suspended">{t("ระงับ", "Suspended")}</option>
          </select>
          <button className="px-4 py-2 rounded-xl bg-surface-100 text-sm" onClick={() => setFilters({ q: "", status: "all" })}>{t("ล้าง", "Clear")}</button>
        </div>
      </div>

      {showForm && <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-surface-900">{form.id ? t("แก้ไขข้อมูลสมาชิก", "Edit member") : t("เพิ่มสมาชิก", "Add member")}</h2>
          <button onClick={() => { setShowForm(false); setForm(emptyForm); }} className="text-sm text-surface-500 hover:text-surface-800">✕</button>
        </div>
        <form onSubmit={submit} className="grid md:grid-cols-3 gap-3">
          <div><label className={label}>{t("บ้านเลขที่", "House number")}</label><input className={input} value={form.house_number} onChange={(e) => setForm({ ...form, house_number: e.target.value })} required /></div>
          <div className="md:col-span-2"><label className={label}>{t("ชื่อเจ้าของ", "Owner name")}</label><input className={input} value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} required /></div>
          <div><label className={label}>{t("เบอร์โทร", "Phone")}</label><input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className={label}>Email</label><input className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className={label}>LINE ID</label><input className={input} value={form.line_id} onChange={(e) => setForm({ ...form, line_id: e.target.value })} /></div>
          <div><label className={label}>{t("ประเภทที่ดิน", "Land type")}</label><select className={input} value={form.land_type} onChange={(e) => setForm({ ...form, land_type: e.target.value })} required><option value="">{t("เลือกประเภทที่ดิน", "Select land type")}</option>{landTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <div><label className={label}>{t("พื้นที่ (ตรว.)", "Area (sq.w.)")}</label><input className={input} type="number" step="0.01" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} /></div>
          <div><label className={label}>{t("จำนวนแปลง", "Land count")}</label><input className={input} type="number" value={form.land_count} onChange={(e) => setForm({ ...form, land_count: e.target.value })} /></div>
          <div><label className={label}>{t("ค่าส่วนกลาง", "Maintenance fee")}</label><input className={input} type="number" step="0.01" value={form.maintenance_fee} onChange={(e) => setForm({ ...form, maintenance_fee: e.target.value })} /></div>
          <div><label className={label}>{t("สถานะ", "Status")}</label><select className={input} value={form.member_status} onChange={(e) => setForm({ ...form, member_status: e.target.value })}><option value="active">{t("ใช้งาน", "Active")}</option><option value="inactive">{t("ไม่ใช้งาน", "Inactive")}</option><option value="suspended">{t("ระงับ", "Suspended")}</option></select></div>
          <div className="md:col-span-3"><label className={label}>{t("หมายเหตุ", "Notes")}</label><textarea className={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <button disabled={saving} className="btn-primary md:col-span-3">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึกข้อมูลสมาชิก", "Save member")}</button>
        </form>
      </div>}

      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
        {loading ? <div className="text-center py-12 text-surface-500">{t("กำลังโหลด...", "Loading...")}</div> : members.length === 0 ? <div className="text-center py-12 text-surface-500">{t("ไม่พบข้อมูลสมาชิก", "No members found")}</div> : <>
          <div className="hidden lg:block overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-surface-50 text-surface-500"><tr><th className="p-3 text-left">{t("บ้าน", "House")}</th><th className="p-3 text-left">{t("เจ้าของ", "Owner")}</th><th className="p-3 text-left">{t("ติดต่อ", "Contact")}</th><th className="p-3 text-right">{t("พื้นที่ (ตรว.)", "Area (sq.w.)")}</th><th className="p-3 text-right">{t("ค่าส่วนกลาง", "Fee")}</th><th className="p-3 text-left">{t("สถานะ", "Status")}</th><th className="p-3"></th></tr></thead><tbody>{members.map((m) => <tr key={m.id} className="border-t border-surface-100 hover:bg-surface-50"><td className="p-3 font-medium"><div>{m.house_number}</div><div className="text-xs font-normal text-surface-500">{landTypeLabel(m.land_type)}</div></td><td className="p-3">{m.owner_name || "-"}</td><td className="p-3 text-surface-600">{m.contact_info?.phone || m.contact_info?.line_id || m.contact_info?.email || "-"}</td><td className="p-3 text-right tabular-nums">{m.area || "-"}</td><td className="p-3 text-right tabular-nums">{formatMoney(m.maintenance_fee, lang)}</td><td className="p-3"><span className="rounded-full bg-surface-100 px-2 py-1 text-xs">{m.member_status}</span></td><td className="p-3 text-right space-x-2"><button onClick={() => editMember(m)} className="text-brand-600 font-medium hover:underline">{t("แก้ไข", "Edit")}</button><button onClick={() => removeMember(m)} className="text-red-600 font-medium hover:underline">{t("ลบ", "Delete")}</button></td></tr>)}</tbody></table></div>
          <div className="lg:hidden divide-y divide-surface-100">{members.map((m) => <div key={m.id} className="p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-semibold text-surface-900">{t("บ้าน", "House")} {m.house_number}</div><div className="text-xs text-surface-500">{landTypeLabel(m.land_type)}</div><div className="text-sm text-surface-500 break-words">{m.owner_name || "-"}</div></div><span className="rounded-full bg-surface-100 px-2 py-1 text-xs shrink-0">{m.member_status}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><span className="text-surface-500">{t("พื้นที่ (ตรว.)", "Area (sq.w.)")}</span><div className="font-semibold">{m.area || "-"}</div></div><div><span className="text-surface-500">{t("ค่าส่วนกลาง", "Fee")}</span><div className="font-semibold">{formatMoney(m.maintenance_fee, lang)}</div></div></div><div className="mt-3 flex gap-2"><button onClick={() => editMember(m)} className="flex-1 rounded-xl bg-brand-50 text-brand-700 py-2 text-sm font-medium">{t("แก้ไข", "Edit")}</button><button onClick={() => removeMember(m)} className="flex-1 rounded-xl bg-red-50 text-red-700 py-2 text-sm font-medium">{t("ลบ", "Delete")}</button></div></div>)}</div>
        </>}
      </div>
    </div>
  );
}
