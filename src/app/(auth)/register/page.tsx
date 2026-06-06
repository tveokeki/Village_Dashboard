"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Toast from "@/components/Toast";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", confirmPassword: "", houseNumber: "", lineId: "" });
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("รหัสผ่านไม่ตรงกัน / Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "เกิดข้อผิดพลาด / Registration failed");
      } else {
        setToast("บันทึกการสมัครสมาชิกเรียบร้อยแล้ว / Registration saved successfully");
        setTimeout(() => router.push("/login?registered=true"), 1200);
      }
    } catch {
      setError("เกิดข้อผิดพลาด / An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col items-center justify-center p-4">
      <Toast message={toast} onClose={() => setToast("")} />
      <div className="w-full max-w-md">
        <div className="bg-gradient-to-r from-brand-500 to-brand-400 rounded-t-2xl h-32 flex flex-col items-center justify-center text-white">
          <div className="w-20 h-20 rounded-full bg-white/90 p-1.5 flex items-center justify-center mb-2 shadow-md ring-1 ring-white/70">
            <img src="/logo-suan-ake.png" alt="Suan Eak Lake Park Villa logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-base font-semibold">สมัครสมาชิก</h1>
        </div>
        <div className="bg-white rounded-b-2xl shadow-xl p-8">
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">ชื่อ-นามสกุล / Full Name</label>
              <input name="fullName" value={form.fullName} onChange={handleChange} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">อีเมล / Email</label>
              <input name="email" value={form.email} onChange={handleChange} type="email" className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">รหัสผ่าน / Password</label>
              <input name="password" value={form.password} onChange={handleChange} type="password" className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">ยืนยันรหัสผ่าน / Confirm Password</label>
              <input name="confirmPassword" value={form.confirmPassword} onChange={handleChange} type="password" className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">บ้านเลขที่ / House Number</label>
              <input name="houseNumber" value={form.houseNumber} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">LINE ID (ไม่บังคับ)</label>
              <input name="lineId" value={form.lineId} onChange={handleChange} className="input-field" />
            </div>
            <button type="submit" disabled={loading} className="w-full btn-primary disabled:opacity-50">
              {loading ? "กำลังสมัคร..." : "สมัครสมาชิก"}
            </button>
          </form>
          <p className="text-sm text-center mt-4 text-surface-500">
            มีบัญชีแล้ว? <Link href="/login" className="text-brand-500 hover:underline">เข้าสู่ระบบ</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
