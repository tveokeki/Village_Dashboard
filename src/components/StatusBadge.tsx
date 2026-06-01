"use client";

import { useLanguage } from "@/components/LanguageContext";
import { DropdownGroups, optionClass, optionText } from "@/lib/dropdown-client";

interface StatusBadgeProps {
  status: string;
  groups?: DropdownGroups;
}

const fallbackStatus: DropdownGroups = {
  ticket_status: [
    { code: "received", label_th: "รับเรื่องแล้ว", label_en: "Received", color_class: "bg-amber-100 text-amber-800 border border-amber-200" },
    { code: "in_progress", label_th: "กำลังดำเนินการ", label_en: "In Progress", color_class: "bg-blue-100 text-blue-800 border border-blue-200" },
    { code: "resolved", label_th: "แก้ไขแล้ว", label_en: "Resolved", color_class: "bg-emerald-100 text-emerald-800 border border-emerald-200" },
    { code: "closed", label_th: "ปิดงานแล้ว", label_en: "Closed", color_class: "bg-surface-200 text-surface-700 border border-surface-300" },
    { code: "cancelled", label_th: "ยกเลิก", label_en: "Cancelled", color_class: "bg-red-100 text-red-800 border border-red-200" },
  ],
};

export default function StatusBadge({ status, groups }: StatusBadgeProps) {
  const { lang } = useLanguage();
  const mergedGroups = groups || fallbackStatus;
  const label = optionText(mergedGroups, "ticket_status", status, lang, status);
  const className = optionClass(mergedGroups, "ticket_status", status, "bg-surface-200 text-surface-700 border border-surface-300");

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}
