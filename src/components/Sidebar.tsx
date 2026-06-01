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

const UAT_BASE_PATH = process.env.NEXT_PUBLIC_UAT_BASE_PATH || "";

const uatPath = (path: string) => `${UAT_BASE_PATH}${path}`;

export default function Sidebar() {
  const pathname = usePathname();
  const { lang } = useLanguage();
  const { user, loading: userLoading } = useCurrentUser();
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || (!userLoading && user?.isAdmin));

  const handleLogout = async () => {
    await signOut({ callbackUrl: uatPath("/login") });
  };

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-surface-200 h-screen sticky top-0">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-surface-200">
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

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const active = pathname === item.href || pathname === uatPath(item.href) || pathname.startsWith(item.href + "/") || pathname.startsWith(uatPath(item.href) + "/");
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
