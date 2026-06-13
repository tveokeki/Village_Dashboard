"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useLanguage } from "./LanguageContext";
import { useCurrentUser } from "@/lib/current-user-client";

const UAT_BASE_PATH = process.env.NEXT_PUBLIC_UAT_BASE_PATH || "";

const uatPath = (path: string) => `${UAT_BASE_PATH}${path}`;

export default function TopNav() {
  const { lang, setLang } = useLanguage();
  const { user, loading: userLoading } = useCurrentUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const toggleMenu = () => setMenuOpen((prev: boolean) => !prev);
  const handleLogout = async () => {
    setMenuOpen(false);
    setUserMenuOpen(false);
    await signOut({ callbackUrl: uatPath("/login") });
  };
  const roles = user?.roles || [user?.role || "resident"];
  const canFinance = Boolean(!userLoading && (user?.isAdmin || roles.some((role: any) => ["admin", "accountant", "manager"].includes(role))));
  const showAdmin = Boolean(!userLoading && user?.isAdmin);
  const mainItems = [
    { icon: "🏠", label: lang === "th" ? "แดชบอร์ด" : "Dashboard", href: "/dashboard" },
    { icon: "🔔", label: lang === "th" ? "แจ้งเตือน" : "Notifications", href: "/notifications" },
    { icon: "📢", label: lang === "th" ? "ประกาศ" : "Announcements", href: "/announcements" },
    { icon: "📄", label: lang === "th" ? "เอกสาร" : "Documents", href: "/documents" },
    { icon: "🎫", label: lang === "th" ? "รายการปัญหา" : "Tickets", href: "/tickets" },
  ];
  const financeItems = [
    { icon: "👥", label: lang === "th" ? "สมาชิก" : "Members", href: "/members" },
    { icon: "💰", label: lang === "th" ? "รายรับ" : "Revenue", href: "/revenue" },
    { icon: "📄", label: lang === "th" ? "จัดการสลิปโอนเงิน" : "Payment Slips", href: "/payment-slips" },
    { icon: "🧾", label: lang === "th" ? "รายจ่าย" : "Expenses", href: "/expenses" },
    { icon: "🏦", label: lang === "th" ? "กระทบยอด" : "Reconciliation", href: "/reconciliation" },
    { icon: "📊", label: lang === "th" ? "รายงานการเงิน" : "Financial Reports", href: "/financial-reports" },
    { icon: "📅", label: lang === "th" ? "รายงานค่าส่วนกลาง" : "Common Fee Report", href: "/common-fee-report" },
  ];
  const adminItems = [
    { icon: "📢", label: lang === "th" ? "จัดการประกาศ" : "Announcements", href: "/admin/announcements" },
    { icon: "📄", label: lang === "th" ? "จัดการเอกสาร" : "Documents", href: "/admin/documents" },
    { icon: "🎫", label: lang === "th" ? "จัดการปัญหาร้องเรียน" : "Tickets", href: "/admin/tickets" },
    { icon: "👥", label: lang === "th" ? "จัดการผู้ใช้" : "Users", href: "/admin/users" },
    { icon: "🔔", label: lang === "th" ? "จัดการแจ้งเตือน" : "Notifications", href: "/admin/notifications" },
  ];
  const bottomItems = [
    { icon: "👤", label: lang === "th" ? "โปรไฟล์" : "Profile", href: "/profile" },
  ];

  return (
    <>
      {/* Mobile Sidebar Overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-[55] bg-black/50 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-[60] h-full w-64 bg-white border-r border-surface-200 transform transition-transform duration-300 lg:hidden ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-surface-200">
          <div className="flex items-center gap-3">
            <img src={uatPath("/logo-suan-ake.png")} alt="Suan Eak Lake Park Villa logo" className="w-10 h-10 rounded-lg object-contain bg-white ring-1 ring-brand-100 p-0.5" />
            <div>
              <div className="text-sm font-semibold text-brand-700">
                {lang === "th" ? "สวนเอก เลคปาร์ควิลล่า" : "Suan Eak Lake Park Villa"}
              </div>
              <div className="text-xs text-surface-500">
                {lang === "th" ? "Suan Eak Lake Park Villa" : "Juristic Person"}
              </div>
            </div>
          </div>
          <button onClick={toggleMenu} className="p-2 rounded-lg hover:bg-surface-100">
            <svg className="w-5 h-5 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="py-4 px-3 pb-28 space-y-1 overflow-y-auto h-[calc(100dvh-81px)] scroll-pb-28">
          {mainItems.map((item) => (
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

          {canFinance && (
            <div className="rounded-2xl border border-surface-100 bg-surface-50/70 py-1">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-surface-700 font-medium">
                <span className="text-lg">💼</span>
                <span className="text-sm">{lang === "th" ? "การเงินและบัญชี" : "Finance"}</span>
              </div>
              <div className="pl-7 pr-2 pb-2 space-y-1">
                {financeItems.map((item) => (
                  <a
                    key={item.href}
                    href={uatPath(item.href)}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-surface-600 hover:bg-white hover:text-brand-700 transition-colors text-sm"
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {showAdmin && (
            <div className="rounded-2xl border border-surface-100 bg-surface-50/70 py-1">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-surface-700 font-medium">
                <span className="text-lg">🛠️</span>
                <span className="text-sm">{lang === "th" ? "ผู้ดูแลระบบ" : "Admin Console"}</span>
              </div>
              <div className="pl-7 pr-2 pb-2 space-y-1">
                {adminItems.map((item) => (
                  <a
                    key={item.href}
                    href={uatPath(item.href)}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-surface-600 hover:bg-white hover:text-brand-700 transition-colors text-sm"
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {bottomItems.map((item) => (
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
              onClick={handleLogout}
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
          <img src={uatPath("/logo-suan-ake.png")} alt="Suan Eak Lake Park Villa logo" className="w-8 h-8 rounded-md object-contain bg-white ring-1 ring-brand-100 p-0.5" />
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

          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className="w-8 h-8 lg:w-9 lg:h-9 rounded-full bg-brand-500 text-white flex items-center justify-center font-semibold text-xs lg:text-sm flex-shrink-0 hover:bg-brand-600 transition-colors overflow-hidden"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              title={lang === "th" ? "เมนูผู้ใช้" : "User menu"}
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                (user?.name || user?.email || (lang === "th" ? "ส" : "U")).slice(0, 1).toUpperCase()
              )}
            </button>
            {userMenuOpen && (
              <>
                <button
                  type="button"
                  aria-label={lang === "th" ? "ปิดเมนูผู้ใช้" : "Close user menu"}
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className="absolute right-0 top-11 z-50 w-56 rounded-2xl border border-surface-200 bg-white shadow-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-surface-100">
                    <div className="text-sm font-medium text-surface-900 truncate">{user?.name || user?.email || (lang === "th" ? "ผู้ใช้" : "User")}</div>
                    {user?.email && <div className="text-xs text-surface-500 truncate mt-0.5">{user.email}</div>}
                  </div>
                  <a
                    href={uatPath("/profile")}
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-surface-700 hover:bg-surface-50"
                  >
                    <span>👤</span>
                    <span>{lang === "th" ? "โปรไฟล์" : "Profile"}</span>
                  </a>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                  >
                    <span>🚪</span>
                    <span>{lang === "th" ? "ออกจากระบบ" : "Logout"}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
