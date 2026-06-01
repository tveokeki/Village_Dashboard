"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Toast from "@/components/Toast";

export default function LoginPage() {
  const [lang, setLang] = useState<"th" | "en">("th");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((providers) => setGoogleEnabled(Boolean(providers?.google)))
      .catch(() => setGoogleEnabled(false));
  }, []);

  const t = (th: string, en: string) => (lang === "th" ? th : en);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("registered") === "true") {
      setToast(t("บันทึกการสมัครสมาชิกเรียบร้อยแล้ว กรุณาเข้าสู่ระบบ", "Registration saved successfully. Please sign in."));
    }
  }, [lang]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        setError(t("อีเมลหรือรหัสผ่านไม่ถูกต้อง", "Invalid email or password"));
      } else {
        window.location.href = "/dashboard";
      }
    } catch {
      setError(t("เกิดข้อผิดพลาด", "An error occurred"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col items-center justify-center p-4">
      <Toast message={toast} onClose={() => setToast("")} />
      {/* Language Switcher */}
      <div className="fixed top-4 right-4 flex items-center bg-surface-100 rounded-lg p-1 border border-surface-200">
        <button
          onClick={() => setLang("th")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${lang === "th" ? "bg-white shadow-sm text-brand-600 font-semibold" : "text-surface-500 hover:text-surface-700"}`}
        >
          TH
        </button>
        <button
          onClick={() => setLang("en")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${lang === "en" ? "bg-white shadow-sm text-brand-600 font-semibold" : "text-surface-500 hover:text-surface-700"}`}
        >
          EN
        </button>
      </div>

      <div className="w-full max-w-md">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-brand-500 to-brand-400 rounded-t-2xl h-48 md:h-52 flex flex-col items-center justify-center text-white">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-4">
            <span className="text-3xl font-bold">สอ</span>
          </div>
          <h1 className="text-lg md:text-xl font-semibold">
            {t("สวนเอก เลคปาร์ควิลล่า", "Suan Eak Lake Park Villa")}
          </h1>
          <p className="text-sm text-white/80">
            {t("ระบบจัดการหมู่บ้าน", "Estate Management System")}
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-b-2xl shadow-xl p-6 md:p-8">
          <h2 className="text-xl font-bold text-surface-900 text-center mb-6">
            {t("เข้าสู่ระบบ", "Sign In")}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                {t("อีเมล", "Email")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-surface-300 bg-white text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm"
                placeholder="email@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                {t("รหัสผ่าน", "Password")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-surface-300 bg-white text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm"
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full px-6 py-3 rounded-xl font-medium bg-gradient-to-r from-brand-500 to-brand-400 text-white shadow-md hover:shadow-lg hover:from-brand-600 hover:to-brand-500 transition-all disabled:opacity-50 text-sm"
            >
              {loading
                ? t("กำลังเข้าสู่ระบบ...", "Signing in...")
                : t("เข้าสู่ระบบด้วยอีเมล", "Sign In with Email")}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-surface-200"></div>
            <span className="text-surface-500 text-sm">{t("หรือ", "or")}</span>
            <div className="flex-1 h-px bg-surface-200"></div>
          </div>

          {/* OAuth Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => {
                const callbackUrl = encodeURIComponent("/dashboard");
                window.location.href = `/api/auth/line-login?callbackUrl=${callbackUrl}`;
              }}
              className="w-full bg-[#06C750] text-white rounded-xl px-6 py-3 font-medium flex items-center justify-center gap-2 hover:bg-[#05b348] transition-colors text-sm"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
              </svg>
              <span>{t("เข้าสู่ระบบด้วย LINE", "Sign in with LINE")}</span>
            </button>

            <button
              onClick={() => googleEnabled ? signIn("google", { callbackUrl: "/dashboard" }) : setError(t("ยังไม่ได้ตั้งค่า Google OAuth Client ID/Secret", "Google OAuth Client ID/Secret is not configured yet"))}
              className={`w-full bg-white border border-surface-300 rounded-xl px-6 py-3 font-medium flex items-center justify-center gap-2 transition-colors text-sm ${googleEnabled ? "text-surface-700 hover:bg-surface-50" : "text-surface-400 cursor-not-allowed"}`}
              title={googleEnabled ? "" : "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET"}
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <span>{t("เข้าสู่ระบบด้วย Google", "Sign in with Google")}</span>
            </button>
          </div>

          {/* Links */}
          <div className="flex justify-between items-center text-sm mt-6 gap-4">
            <a href="/register" className="text-brand-500 hover:underline font-medium whitespace-nowrap">
              {t("สมัครสมาชิก", "Register")}
            </a>
            <a href="/reset-password" className="text-surface-500 hover:text-brand-500 whitespace-nowrap">
              {t("ลืมรหัสผ่าน?", "Forgot Password?")}
            </a>
          </div>
        </div>
      </div>

      <p className="mt-6 text-xs text-surface-400">
        © 2026 {t("สวนเอก เลคปาร์ควิลล่า", "Suan Eak Lake Park Villa")}
      </p>
    </div>
  );
}
