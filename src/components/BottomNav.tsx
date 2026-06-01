"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "./LanguageContext";

const navItems = [
  { icon: "🏠", label: { th: "หน้าหลัก", en: "Home" }, href: "/dashboard" },
  { icon: "📢", label: { th: "ประกาศ", en: "News" }, href: "/announcements" },
  { icon: "🎫", label: { th: "ปัญหา", en: "Tickets" }, href: "/tickets" },
  { icon: "📄", label: { th: "เอกสาร", en: "Docs" }, href: "/documents" },
  { icon: "🔔", label: { th: "แจ้งเตือน", en: "Alerts" }, href: "/notifications" },
];

const UAT_BASE_PATH = process.env.NEXT_PUBLIC_UAT_BASE_PATH || "";

const uatPath = (path: string) => `${UAT_BASE_PATH}${path}`;

export default function BottomNav() {
  const pathname = usePathname();
  const { lang } = useLanguage();

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden">
      <div className="max-w-screen-sm mx-auto">
        <nav className="bg-white border-t border-surface-200 safe-area-bottom">
          <div className="flex items-center justify-around h-14">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname === uatPath(item.href) || pathname.startsWith(item.href + "/") || pathname.startsWith(uatPath(item.href) + "/");
              return (
                <Link
                  key={item.href}
                  href={uatPath(item.href)}
                  className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 ${
                    active ? "text-brand-600" : "text-surface-400"
                  }`}
                >
                  <span className={`text-[22px] leading-none ${active ? "scale-110" : ""} transition-transform`}>{item.icon}</span>
                  <span className="text-[10px] font-medium leading-tight">{item.label[lang]}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
