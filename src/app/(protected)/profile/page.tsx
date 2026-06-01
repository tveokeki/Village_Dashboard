"use client";

import { useState } from "react";
import { useLanguage } from "@/components/LanguageContext";
import Toast from "@/components/Toast";
import { useCurrentUser } from "@/lib/current-user-client";

const UAT_BASE_PATH = "/uat";
const uatPath = (path: string) => `${UAT_BASE_PATH}${path}`;

export default function ProfilePage() {
  const { lang } = useLanguage();
  const { user } = useCurrentUser();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [msg, setMsg] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const t = (th: string, en: string) => (lang === "th" ? th : en);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(""); setError("");
    if (newPw !== confirmPw) { setError(t("รหัสผ่านใหม่ไม่ตรงกัน", "New passwords don't match")); return; }
    setLoading(true);
    try {
      const res = await fetch(uatPath("/api/auth/change-password"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }) });
      const data = await res.json();
      if (!res.ok) setError(data.error || t("เกิดข้อผิดพลาด", "An error occurred"));
      else { const success = t("บันทึกการเปลี่ยนรหัสผ่านเรียบร้อยแล้ว", "Password change saved successfully"); setMsg(success + " ✅"); setToast(success); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }
    } catch { setError(t("เกิดข้อผิดพลาด", "An error occurred")); }
    finally { setLoading(false); }
  };

  return (
    <>
      <Toast message={toast} onClose={() => setToast("")} />
      <h1 className="text-2xl font-bold text-surface-900 mb-1">{t("โปรไฟล์", "Profile")}</h1>
      <p className="text-sm text-surface-500 mb-8">{t("จัดการข้อมูลส่วนตัวและความปลอดภัย", "Manage your personal info and security")}</p>

      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-brand-500 text-white flex items-center justify-center text-2xl font-bold">ส</div>
          <div>
            <h2 className="font-semibold text-surface-800">{t("ผู้อยู่อาศัย", "Resident")}</h2>
            <p className="text-sm text-surface-500">{t("สมาชิกหมู่บ้าน", "Estate Member")}</p>
          </div>
        </div>
      </div>

      {user?.canChangePassword && (
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-surface-800 mb-4">🔒 {t("เปลี่ยนรหัสผ่าน", "Change Password")}</h2>
          {msg && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm">{msg}</div>}
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-sm font-medium text-surface-700 mb-1">{t("รหัสผ่านปัจจุบัน", "Current Password")}</label><input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-surface-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400" required /></div>
            <div><label className="block text-sm font-medium text-surface-700 mb-1">{t("รหัสผ่านใหม่", "New Password")}</label><input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-surface-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400" required /></div>
            <div><label className="block text-sm font-medium text-surface-700 mb-1">{t("ยืนยันรหัสผ่านใหม่", "Confirm New Password")}</label><input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-surface-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400" required /></div>
            <button type="submit" disabled={loading} className="px-6 py-3 rounded-xl font-medium bg-gradient-to-r from-brand-500 to-brand-400 text-white shadow-md hover:shadow-lg hover:from-brand-600 hover:to-brand-500 transition-all disabled:opacity-50">
              {loading ? t("กำลังเปลี่ยน...", "Changing...") : t("เปลี่ยนรหัสผ่าน", "Change Password")}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
