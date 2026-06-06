"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useLanguage } from "./LanguageContext";
import { useCurrentUser } from "@/lib/current-user-client";

type NavItem = {
  icon: string;
  label: { th: string; en: string };
  href: string;
  adminOnly?: boolean;
};

const navItems: NavItem[] = [
  { icon: "🏠", label: { th: "แดชบอร์ด", en: "Dashboard" }, href: "/dashboard" },
  { icon: "📢", label: { th: "ประกาศ", en: "Announcements" }, href: "/announcements" },
  { icon: "🎫", label: { th: "รายการปัญหา", en: "Tickets" }, href: "/tickets" },
  { icon: "📄", label: { th: "เอกสาร", en: "Documents" }, href: "/documents" },
  { icon: "🔔", label: { th: "แจ้งเตือน", en: "Notifications" }, href: "/notifications" },
  { icon: "👤", label: { th: "โปรไฟล์", en: "Profile" }, href: "/profile" },
  { icon: "🛠️", label: { th: "ผู้ดูแล", en: "Admin" }, href: "/admin", adminOnly: true },
];

const financeItems: NavItem[] = [
  { icon: "💰", label: { th: "รายรับ", en: "Revenue" }, href: "/revenue" },
  { icon: "🧾", label: { th: "รายจ่าย", en: "Expenses" }, href: "/expenses" },
  { icon: "🏦", label: { th: "กระทบยอด", en: "Reconciliation" }, href: "/reconciliation" },
  { icon: "📊", label: { th: "รายงานการเงิน", en: "Financial Reports" }, href: "/financial-reports" },
];

const UAT_BASE_PATH = process.env.NEXT_PUBLIC_UAT_BASE_PATH || "";

const uatPath = (path: string) => `${UAT_BASE_PATH}${path}`;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname === uatPath(href) || pathname.startsWith(href + "/") || pathname.startsWith(uatPath(href) + "/");
}

export default function Sidebar() {
  const pathname = usePathname();
  const { lang } = useLanguage();
  const { user, loading: userLoading } = useCurrentUser();
  const roles = user?.roles || [user?.role || "resident"];
  const canFinance = Boolean(!userLoading && (user?.isAdmin || roles.some((role) => ["admin", "accountant", "manager"].includes(role))));
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || (!userLoading && user?.isAdmin));
  const financeActive = financeItems.some((item) => isActive(pathname, item.href));

  const handleLogout = async () => {
    await signOut({ callbackUrl: uatPath("/login") });
  };

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-surface-200 h-screen sticky top-0">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-surface-200">
        <img src="/logo-suan-ake.png" alt="Suan Eak Lake Park Villa logo" className="w-10 h-10 rounded-lg object-contain bg-white ring-1 ring-brand-100 p-0.5" />
        <div>
          <div className="text-sm font-semibold text-brand-700">
            {lang === "th" ? "สวนเอก เลคปาร์ควิลล่า" : "Suan Eak Lake Park Villa"}
          </div>
          <div className="text-xs text-surface-500">
            {lang === "th" ? "Lake Park Villa" : "Juristic Person"}
          </div>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {visibleNavItems.slice(0, 4).map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={uatPath(item.href)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-150 ${
                active
                  ? "bg-brand-50 text-brand-700 font-medium border border-brand-200"
                  : "text-surface-600 hover:bg-surface-100 hover:text-surface-800"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-sm">{item.label[lang]}</span>
            </Link>
          );
        })}

        {canFinance && (
          <div className={`rounded-2xl border transition-colors ${financeActive ? "bg-brand-50/60 border-brand-200" : "border-transparent"}`}>
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${financeActive ? "text-brand-700 font-medium" : "text-surface-700"}`}>
              <span className="text-lg">💼</span>
              <span className="text-sm">{lang === "th" ? "การเงินและบัญชี" : "Finance"}</span>
            </div>
            <div className="pb-2 pl-7 pr-2 space-y-1">
              {financeItems.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={uatPath(item.href)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm ${
                      active
                        ? "bg-white text-brand-700 font-medium shadow-sm"
                        : "text-surface-600 hover:bg-surface-100 hover:text-surface-800"
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label[lang]}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {visibleNavItems.slice(4).map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={uatPath(item.href)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-150 ${
                active
                  ? "bg-brand-50 text-brand-700 font-medium border border-brand-200"
                  : "text-surface-600 hover:bg-surface-100 hover:text-surface-800"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-sm">{item.label[lang]}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-surface-200 p-3">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-surface-600 hover:bg-red-50 hover:text-red-600 transition-colors w-full text-sm"
        >
          <span>🚪</span>
          <span>{lang === "th" ? "ออกจากระบบ" : "Logout"}</span>
        </button>
      </div>
    </aside>
  );
}
