"use client";

import { useState } from "react";
import { useLanguage } from "./LanguageContext";

const UAT_BASE_PATH = "/uat";

const uatPath = (path: string) => `${UAT_BASE_PATH}${path}`;

export default function TopNav() {
  const { lang, setLang } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => setMenuOpen((prev) => !prev);

  return (
    <>
      {/* Mobile Sidebar Overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-surface-200 transform transition-transform duration-300 lg:hidden ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-surface-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">สอ</div>
            <div>
              <div className="text-sm font-semibold text-brand-700">
                {lang === "th" ? "สวนเอก เลคปาร์ควิลล่า" : "Suan Eak Lake Park Villa"}
              </div>
              <div className="text-xs text-surface-500">
                {lang === "th" ? "Lake Park Villa" : "Juristic Person"}
              </div>
            </div>
          </div>
          <button onClick={toggleMenu} className="p-2 rounded-lg hover:bg-surface-100">
            <svg className="w-5 h-5 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="py-4 px-3 space-y-1">
          {[
            { icon: "🏠", label: lang === "th" ? "แดชบอร์ด" : "Dashboard", href: "/dashboard" },
            { icon: "📢", label: lang === "th" ? "ประกาศ" : "Announcements", href: "/announcements" },
            { icon: "🎫", label: lang === "th" ? "รายการปัญหา" : "Tickets", href: "/tickets" },
            { icon: "📄", label: lang === "th" ? "เอกสาร" : "Documents", href: "/documents" },
            { icon: "🔔", label: lang === "th" ? "แจ้งเตือน" : "Notifications", href: "/notifications" },
            { icon: "👤", label: lang === "th" ? "โปรไฟล์" : "Profile", href: "/profile" },
            { icon: "🛠️", label: lang === "th" ? "ผู้ดูแล" : "Admin", href: "/admin" },
          ].map((item) => (
            <a
              key={item.href}
              href={uatPath(item.href)}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-surface-600 hover:bg-surface-100 hover:text-surface-800 transition-colors"
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-sm">{item.label}</span>
            </a>
          ))}

          <div className="pt-4 border-t border-surface-200">
            <button
              onClick={() => {
                setMenuOpen(false);
                window.location.href = uatPath("/api/auth/signout");
              }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-surface-600 hover:bg-red-50 hover:text-red-600 transition-colors w-full text-sm"
            >
              <span>🚪</span>
              <span>{lang === "th" ? "ออกจากระบบ" : "Logout"}</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* Top Nav Bar */}
      <header className="fixed top-0 inset-x-0 lg:left-64 z-30 bg-white/80 backdrop-blur-md border-b border-surface-200 h-14 flex items-center justify-between px-4 lg:px-8">
        <div className="flex items-center gap-3">
          <button onClick={toggleMenu} className="lg:hidden p-2 rounded-lg hover:bg-surface-100 flex-shrink-0">
            <svg className="w-6 h-6 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-semibold text-brand-700 hidden sm:inline text-sm lg:text-base">
            {lang === "th" ? "สวนเอก เลคปาร์ควิลล่า" : "Suan Eak Lake Park Villa"}
          </span>
          <span className="font-semibold text-brand-700 sm:hidden text-sm">
            {lang === "th" ? "สวนเอก" : "Suan Eak"}
          </span>
        </div>

        <div className="flex items-center gap-2 lg:gap-3">
          <div className="flex items-center bg-surface-100 rounded-lg p-0.5 border border-surface-200">
            <button
              onClick={() => setLang("th")}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                lang === "th" ? "bg-white shadow-sm text-brand-600 font-semibold" : "text-surface-500 hover:text-surface-700"
              }`}
            >
              TH
            </button>
            <button
              onClick={() => setLang("en")}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                lang === "en" ? "bg-white shadow-sm text-brand-600 font-semibold" : "text-surface-500 hover:text-surface-700"
              }`}
            >
              EN
            </button>
          </div>

          <button className="w-8 h-8 lg:w-9 lg:h-9 rounded-full bg-brand-500 text-white flex items-center justify-center font-semibold text-xs lg:text-sm flex-shrink-0">
            {lang === "th" ? "ส" : "U"}
          </button>
        </div>
      </header>
    </>
  );
}
