"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageContext";
import { DropdownGroups, fetchDropdownGroups } from "@/lib/dropdown-client";

export default function DocumentsPage() {
  const { lang } = useLanguage();
  const [documents, setDocuments] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [dropdownGroups, setDropdownGroups] = useState<DropdownGroups>({});

  useEffect(() => {
    fetchDropdownGroups(["document_category"]).then(setDropdownGroups).catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    const url = activeCategory === "all" ? "/api/documents" : `/api/documents?category=${activeCategory}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => setDocuments(d.documents || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeCategory]);

  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const categories = [
    { code: "all", label: t("ทั้งหมด", "All"), icon: "📋" },
    ...(dropdownGroups.document_category || [
      { code: "rules", label_th: "กฎระเบียบหมู่บ้านฯ", label_en: "Village Rules", icon: "📜" },
      { code: "common_fee", label_th: "อัตราค่าส่วนกลาง", label_en: "Common Fees", icon: "💰" },
      { code: "account", label_th: "บัญชีรายรับ-รายจ่าย", label_en: "Income/Expense Reports", icon: "📊" },
      { code: "meeting", label_th: "รายงานการประชุม", label_en: "Meeting Minutes", icon: "📝" },
    ]).map((cat) => ({ code: cat.code, label: lang === "th" ? cat.label_th : cat.label_en || cat.label_th, icon: cat.icon || "📄" })),
  ];
  const formatFileSize = (bytes: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  };
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString(lang === "th" ? "th-TH" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  const getFileIcon = (mime: string) => {
    if (mime?.includes("pdf")) return "🔴";
    if (mime?.includes("sheet") || mime?.includes("excel")) return "🟢";
    if (mime?.includes("doc")) return "🔵";
    return "📄";
  };

  return (
    <div className="py-4">
      <h1 className="text-xl font-bold text-surface-900 mb-1">
        {t("ดาวน์โหลดเอกสาร", "Document Downloads")}
      </h1>
      <p className="text-sm text-surface-500 mb-4">
        {t("เอกสารสำคัญของหมู่บ้าน", "Important estate documents")}
      </p>

      {/* Category tabs */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar -mx-4 px-4 pb-2">
        {categories.map((cat) => (
          <button
            key={cat.code}
            onClick={() => setActiveCategory(cat.code)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
              activeCategory === cat.code
                ? "bg-brand-500 text-white shadow-sm"
                : "bg-white text-surface-600 border border-surface-200"
            }`}
          >
            <span>{cat.icon}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-surface-500">
          {t("กำลังโหลด...", "Loading...")}
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12 text-surface-500">
          {t("ไม่มีเอกสารในหมวดนี้", "No documents in this category")}
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="bg-white rounded-xl border border-surface-200 shadow-sm p-3"
            >
              {/* บรรทัดแรก: icon + ชื่อเอกสาร */}
              <div className="flex items-start gap-3 mb-2">
                <span className="text-2xl shrink-0 mt-0.5">{getFileIcon(doc.mime_type)}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-surface-800 text-sm leading-snug break-words">
                    {lang === "th" ? doc.title_th : doc.title_en || doc.title_th}
                  </h3>
                </div>
              </div>
              {/* บรรทัดที่สอง: ข้อมูล + ปุ่มดาวน์โหลด */}
              <div className="flex items-center justify-between pl-10">
                <div className="flex items-center gap-2 text-[11px] text-surface-500">
                  <span>{formatDate(doc.published_at)}</span>
                  <span>•</span>
                  <span>{formatFileSize(doc.file_size_bytes)}</span>
                </div>
                {doc.file_available ? (
                  <a href={`/api/documents/${doc.id}/download`} className="shrink-0 px-3 py-1.5 flex items-center justify-center rounded-lg bg-brand-500 text-white text-xs font-medium hover:bg-brand-600 transition-colors gap-1">
                    <span>⬇</span>
                    <span>{t("ดาวน์โหลด", "Download")}</span>
                  </a>
                ) : (
                  <button disabled className="shrink-0 px-3 py-1.5 flex items-center justify-center rounded-lg bg-surface-200 text-surface-500 text-xs font-medium gap-1">
                    <span>⬇</span>
                    <span>{t("ไม่มีไฟล์", "No file")}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
