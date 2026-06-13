"use client";

import { useState, useEffect } from "react";
import { useLanguage } from "@/components/LanguageContext";
import Toast from "@/components/Toast";
import { useCurrentUser } from "@/lib/current-user-client";

const UAT_BASE_PATH = process.env.NEXT_PUBLIC_UAT_BASE_PATH || "";
const uatPath = (path: string) => `${UAT_BASE_PATH}${path}`;

export default function ProfilePage() {
  const { lang } = useLanguage();
  const { user } = useCurrentUser();
  
  const [displayName, setDisplayName] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [phone, setPhone] = useState("");
  
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  
  const [msg, setMsg] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [infoMsg, setInfoMsg] = useState("");
  const [infoError, setInfoError] = useState("");
  const [infoLoading, setInfoLoading] = useState(false);

  const t = (th: string, en: string) => (lang === "th" ? th : en);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || "");
      setHouseNumber(user.houseNumber || "");
      setPhone(user.phone || "");
    }
  }, [user]);

  const handleInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInfoMsg(""); setInfoError("");
    setInfoLoading(true);
    try {
      const res = await fetch(uatPath("/api/me"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, houseNumber, phone }),
      });
      const data = await res.json();
      if (!res.ok) setInfoError(data.error || t("เกิดข้อผิดพลาด", "An error occurred"));
      else {
        const success = t("บันทึกข้อมูลส่วนตัวเรียบร้อยแล้ว", "Personal info saved successfully");
        setInfoMsg(success + " ✅");
        setToast(success);
      }
    } catch {
      setInfoError(t("เกิดข้อผิดพลาด", "An error occurred"));
    } finally {
      setInfoLoading(false);
    }
  };

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

      {/* Personal Info Form */}
      <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-surface-800 mb-4">👤 {t("ข้อมูลส่วนตัว", "Personal Information")}</h2>
        
        {infoMsg && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm">{infoMsg}</div>}
        {infoError && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{infoError}</div>}
        
        <form onSubmit={handleInfoSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">{t("ชื่อแสดงผล (display_name)", "Display Name")}</label>
            <input 
              type="text" 
              value={displayName} 
              onChange={(e) => setDisplayName(e.target.value)} 
              className="w-full px-4 py-3 rounded-xl border border-surface-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400" 
              placeholder={t("ระบุชื่อจริงหรือชื่อเล่น", "Enter full name or nickname")}
              required 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">{t("บ้านเลขที่", "House Number")}</label>
            <input 
              type="text" 
              value={houseNumber} 
              onChange={(e) => setHouseNumber(e.target.value)} 
              className="w-full px-4 py-3 rounded-xl border border-surface-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400" 
              placeholder={t("ตัวอย่าง: 99/99", "Example: 99/99")}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">{t("เบอร์โทรติดต่อ", "Phone Number")}</label>
            <input 
              type="tel" 
              value={phone} 
              onChange={(e) => setPhone(e.target.value)} 
              className="w-full px-4 py-3 rounded-xl border border-surface-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400" 
              placeholder={t("ตัวอย่าง: 0812345678", "Example: 0812345678")}
            />
          </div>
          
          <button 
            type="submit" 
            disabled={infoLoading} 
            className="px-6 py-3 rounded-xl font-medium bg-gradient-to-r from-brand-500 to-brand-400 text-white shadow-md hover:shadow-lg hover:from-brand-600 hover:to-brand-500 transition-all disabled:opacity-50"
          >
            {infoLoading ? t("กำลังบันทึก...", "Saving...") : t("บันทึกข้อมูล", "Save Info")}
          </button>
        </form>
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