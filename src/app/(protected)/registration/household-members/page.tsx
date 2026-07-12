"use client";

import { useEffect, useState } from "react";
import Toast from "@/components/Toast";
import { useLanguage } from "@/components/LanguageContext";

const UAT_BASE_PATH = process.env.NEXT_PUBLIC_UAT_BASE_PATH || "";
const uatPath = (path: string) => `${UAT_BASE_PATH}${path}`;

type HouseholdMember = {
  id: string;
  full_name: string;
  relationship: string;
  age: number | null;
  image_path?: string | null;
  image_name?: string | null;
  image_available?: boolean;
};

const emptyForm = { full_name: "", relationship: "", age: "", image: null as File | null };
const relationshipOptions = ["เจ้าของบ้าน", "คู่สมรส", "บุตร", "บิดา/มารดา", "ญาติ", "ผู้พักอาศัย", "อื่น ๆ"];

export default function HouseholdMembersPage() {
  const { lang } = useLanguage();
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const [items, setItems] = useState<HouseholdMember[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const fetchItems = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(uatPath("/api/registration/household-members"));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("โหลดข้อมูลไม่สำเร็จ", "Failed to load data"));
      setItems(data.members || []);
    } catch (err: any) {
      setError(err.message || t("เกิดข้อผิดพลาด", "An error occurred"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (item: HouseholdMember) => {
    setForm({ full_name: item.full_name, relationship: item.relationship, age: item.age === null ? "" : String(item.age), image: null });
    setEditingId(item.id);
    setShowForm(true);
    setConfirmDeleteId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = new FormData();
      payload.set("full_name", form.full_name);
      payload.set("relationship", form.relationship);
      payload.set("age", form.age === "" ? "" : String(Number(form.age)));
      if (form.image) payload.set("image", form.image);
      const res = await fetch(uatPath(editingId ? `/api/registration/household-members/${editingId}` : "/api/registration/household-members"), {
        method: editingId ? "PATCH" : "POST",
        body: payload,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("บันทึกข้อมูลไม่สำเร็จ", "Failed to save"));
      setToast(editingId ? t("แก้ไขข้อมูลสำเร็จ", "Updated successfully") : t("เพิ่มสมาชิกสำเร็จ", "Member added"));
      resetForm();
      await fetchItems();
    } catch (err: any) {
      setError(err.message || t("เกิดข้อผิดพลาด", "An error occurred"));
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (id: string) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(uatPath(`/api/registration/household-members/${id}`), { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("ลบข้อมูลไม่สำเร็จ", "Failed to delete"));
      setToast(t("ลบรายการเรียบร้อยแล้ว", "Deleted successfully"));
      setConfirmDeleteId(null);
      await fetchItems();
    } catch (err: any) {
      setError(err.message || t("เกิดข้อผิดพลาด", "An error occurred"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Toast message={toast} onClose={() => setToast("")} />
      <div className="py-6 space-y-6">
        <div className="bg-white rounded-3xl border border-surface-200 p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <p className="text-sm text-brand-600 font-semibold mb-1">📝 {t("ลงทะเบียน", "Registration")}</p>
              <h1 className="text-2xl font-bold text-surface-900">{t("สมาชิกในบ้าน", "Household Members")}</h1>
              <p className="text-sm text-surface-500 mt-2">{t("เพิ่มหรือแก้ไขข้อมูลสมาชิกที่พักอาศัยในบ้านของคุณ สามารถเพิ่มได้หลายรายการ", "Add or update people living in your household. Multiple entries are supported.")}</p>
            </div>
            <button onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); }} className="px-5 py-3 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold shadow-md active:scale-[0.98]">
              + {t("เพิ่มสมาชิก", "Add Member")}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-surface-200 p-5 shadow-sm">
            <div className="text-sm text-surface-500">{t("สมาชิกทั้งหมด", "Total members")}</div>
            <div className="text-3xl font-bold text-brand-700 mt-1">{items.length}</div>
          </div>
        </div>

        {error && <div className="p-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>}

        {showForm && (
          <form key={editingId || "new-member-form"} onSubmit={handleSubmit} className="bg-white rounded-3xl border border-brand-200 p-5 sm:p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-surface-900">{editingId ? t("แก้ไขข้อมูลสมาชิก", "Edit Member") : t("ข้อมูลสมาชิกในบ้าน", "Household Member Information")}</h2>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">{t("ชื่อ-นามสกุล", "Full Name")}</label>
              <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder={t("เช่น สมชาย ใจดี", "Example: Somchai Jaidee")} className="w-full px-4 py-3 rounded-xl border border-surface-300 focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">{t("ความสัมพันธ์", "Relationship")}</label>
                <select required value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-surface-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400">
                  <option value="">{t("เลือกความสัมพันธ์", "Select relationship")}</option>
                  {relationshipOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">{t("อายุ", "Age")}</label>
                <input type="number" min="0" max="120" inputMode="numeric" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder={t("เช่น 35", "Example: 35")} className="w-full px-4 py-3 rounded-xl border border-surface-300 focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">{t("รูปสมาชิก", "Member Photo")}</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => setForm({ ...form, image: e.target.files?.[0] || null })}
                className="w-full rounded-xl border border-dashed border-surface-300 bg-surface-50 px-4 py-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:bg-brand-50"
              />
              <p className="mt-1 text-xs text-surface-500">
                {editingId ? t("ถ้าไม่เลือกรูปใหม่ ระบบจะคงรูปเดิมไว้", "Leave empty to keep the existing photo") : t("รองรับ JPG, PNG, WEBP, GIF ขนาดไม่เกิน 8MB", "JPG, PNG, WEBP, GIF up to 8MB")}
              </p>
              {form.image && <p className="mt-2 text-xs font-medium text-brand-700">📷 {form.image.name}</p>}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button disabled={saving} className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึกข้อมูล", "Save")}</button>
              <button type="button" onClick={resetForm} className="px-6 py-3 rounded-xl border border-surface-300 text-surface-700 font-medium hover:bg-surface-50">{t("ยกเลิก", "Cancel")}</button>
            </div>
          </form>
        )}

        <div className="space-y-3">
          {loading ? <div className="text-center text-surface-500 py-12">{t("กำลังโหลดข้อมูล...", "Loading...")}</div> : items.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-surface-300 p-8 text-center text-surface-500">
              <div className="text-4xl mb-3">👨‍👩‍👧‍👦</div>
              <p className="font-semibold text-surface-800">{t("ยังไม่มีข้อมูลสมาชิกในบ้าน", "No household members registered yet")}</p>
              <button onClick={() => setShowForm(true)} className="mt-4 px-5 py-2.5 rounded-xl bg-brand-50 text-brand-700 font-medium hover:bg-brand-100">{t("เพิ่มสมาชิกคนแรก", "Add first member")}</button>
            </div>
          ) : items.map((item) => (
            <div key={item.id} className="bg-white rounded-2xl border border-surface-200 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-surface-200 bg-surface-100">
                    {item.image_available && item.image_path ? (
                      <img src={uatPath(item.image_path)} alt={item.full_name} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl">👤</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-surface-900 break-words">{item.full_name}</h3>
                    <p className="text-sm text-surface-500 mt-1">{item.relationship}{item.age !== null ? ` • ${t("อายุ", "Age")} ${item.age} ${t("ปี", "years")}` : ""}</p>
                    {item.image_name && <p className="mt-1 text-xs text-surface-400 truncate">📷 {item.image_name}</p>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => startEdit(item)} className="px-3 py-2 rounded-lg bg-surface-100 text-surface-700 text-sm hover:bg-surface-200">{t("แก้ไข", "Edit")}</button>
                  <button onClick={() => setConfirmDeleteId(item.id)} className="px-3 py-2 rounded-lg bg-red-50 text-red-600 text-sm hover:bg-red-100">{t("ลบ", "Delete")}</button>
                </div>
              </div>
              {confirmDeleteId === item.id && (
                <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <span>{t("ต้องการลบรายการนี้หรือไม่?", "Delete this item?")}</span>
                  <div className="flex gap-2"><button onClick={() => deleteItem(item.id)} className="px-3 py-2 rounded-lg bg-red-600 text-white">{t("ยืนยันการลบ", "Confirm")}</button><button onClick={() => setConfirmDeleteId(null)} className="px-3 py-2 rounded-lg bg-white border border-red-200">{t("ยกเลิก", "Cancel")}</button></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
