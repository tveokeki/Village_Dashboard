"use client";

import { useState } from "react";

const UAT_BASE_PATH = process.env.NEXT_PUBLIC_UAT_BASE_PATH || "";
const uatPath = (path: string) => `${UAT_BASE_PATH}${path}`;

export default function LoginPage() {
  const [lang, setLang] = useState<"th" | "en">("th");

  const t = (th: string, en: string) => (lang === "th" ? th : en);

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col items-center justify-center p-4">
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
          <div className="w-28 h-28 rounded-full bg-white/90 p-2 flex items-center justify-center mb-3 shadow-lg ring-1 ring-white/70">
            <img src={uatPath("/logo-suan-ake.png")} alt={t("โลโก้สวนเอก เลคปาร์ควิลล่า", "Suan Eak Lake Park Villa logo")} className="w-full h-full object-contain" />
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

          {/* LINE Sign-in */}
          <div className="space-y-3">
            <a
              href={uatPath(`/api/auth/line-login?callbackUrl=${encodeURIComponent(uatPath("/dashboard"))}`)}
              className="w-full bg-[#06C750] text-white rounded-xl px-6 py-3 font-medium flex items-center justify-center gap-2 hover:bg-[#05b348] transition-colors text-sm"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
              </svg>
              <span>{t("เข้าสู่ระบบด้วย LINE", "Sign in with LINE")}</span>
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
