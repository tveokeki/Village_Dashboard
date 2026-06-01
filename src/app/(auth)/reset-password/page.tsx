"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Toast from "@/components/Toast";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") || "");
  }, []);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
      setToast("ส่งคำขอรีเซ็ตรหัสผ่านแล้ว / Reset request sent");
    } catch {
      // Always show success to prevent email enumeration
      setSent(true);
      setToast("ส่งคำขอรีเซ็ตรหัสผ่านแล้ว / Reset request sent");
    } finally {
      setLoading(false);
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร / Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("รหัสผ่านไม่ตรงกัน / Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      setCompleted(true);
      setToast("ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว / Password reset successfully");
    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาด / An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col items-center justify-center p-4">
      <Toast message={toast} onClose={() => setToast("")} />
      <div className="w-full max-w-md">
        <div className="bg-gradient-to-r from-brand-500 to-brand-400 rounded-t-2xl h-32 flex flex-col items-center justify-center text-white">
          <h1 className="text-xl font-semibold">รีเซ็ตรหัสผ่าน</h1>
          <p className="text-sm text-white/80">Reset Password</p>
        </div>
        <div className="bg-white rounded-b-2xl shadow-xl p-8">
          {completed ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-surface-700 mb-2">ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว</p>
              <p className="text-sm text-surface-500 mb-4">Your password has been reset successfully</p>
              <Link href="/login" className="text-brand-500 hover:underline text-sm">เข้าสู่ระบบ / Login</Link>
            </div>
          ) : token ? (
            <form onSubmit={handleSetNewPassword} className="space-y-4">
              <p className="text-sm text-surface-600 mb-2">ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ</p>
              {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">รหัสผ่านใหม่ / New Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input-field" required minLength={8} />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">ยืนยันรหัสผ่าน / Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input-field" required minLength={8} />
              </div>
              <button type="submit" disabled={loading} className="w-full btn-primary disabled:opacity-50">
                {loading ? "กำลังบันทึก..." : "ตั้งรหัสผ่านใหม่"}
              </button>
            </form>
          ) : sent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-surface-700 mb-2">ถ้าอีเมลนี้มีอยู่ในระบบ จะได้รับลิงก์รีเซ็ตรหัสผ่าน</p>
              <p className="text-sm text-surface-500 mb-4">If the email exists, a reset link will be sent</p>
              <Link href="/login" className="text-brand-500 hover:underline text-sm">กลับหน้าเข้าสู่ระบบ</Link>
            </div>
          ) : (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <p className="text-sm text-surface-600 mb-2">กรอกอีเมลที่ใช้สมัครสมาชิก ระบบจะส่งลิงก์รีเซ็ตรหัสผ่านให้</p>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">อีเมล / Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" required />
              </div>
              <button type="submit" disabled={loading} className="w-full btn-primary disabled:opacity-50">
                {loading ? "กำลังส่ง..." : "ส่งลิงก์รีเซ็ต"}
              </button>
              <Link href="/login" className="block text-center text-sm text-brand-500 hover:underline mt-2">กลับหน้าเข้าสู่ระบบ</Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
