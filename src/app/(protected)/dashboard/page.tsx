"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/components/LanguageContext";

const UAT_BASE_PATH = "/uat";

const uatPath = (path: string) => `${UAT_BASE_PATH}${path}`;

export default function DashboardPage() {
  const { lang } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(uatPath("/api/stats"))
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const t = (th: string, en: string) => (lang === "th" ? th : en);

  const formatDate = (d: string) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString(lang === "th" ? "th-TH" : "en-US", { day: "numeric", month: "short", year: "numeric" });
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  };

  return (
    <>
      <h1 className="text-xl font-bold text-surface-900 mb-1">
        {t("สวัสดี! 👋", "Welcome! 👋")}
      </h1>
      <p className="text-sm text-surface-500 mb-6">
        {t("ยินดีต้อนรับกลับสู่ระบบจัดการหมู่บ้าน", "Welcome back to the management system")}
      </p>

      {loading ? (
        <div className="text-center py-12 text-surface-500">{t("กำลังโหลด...", "Loading...")}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
            <Link href={uatPath("/tickets?status=received")} className="block bg-white rounded-2xl border border-surface-200 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2" aria-label={t("เปิดรายการปัญหารอดำเนินการ", "Open pending tickets") }>
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center mb-3">
                <span className="text-amber-600 text-lg">⏳</span>
              </div>
              <div className="text-3xl font-bold text-surface-900">{data?.stats?.received || 0}</div>
              <div className="text-sm text-surface-500 mt-1">{t("รับเรื่องแล้ว", "Received")}</div>
              <div className="text-xs text-brand-600 mt-3 font-medium">{t("ดูรายการ →", "View tickets →")}</div>
            </Link>
            <Link href={uatPath("/tickets?status=in_progress")} className="block bg-white rounded-2xl border border-surface-200 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2" aria-label={t("เปิดรายการปัญหาที่กำลังแก้ไข", "Open in-progress tickets") }>
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center mb-3">
                <span className="text-blue-600 text-lg">🔧</span>
              </div>
              <div className="text-3xl font-bold text-surface-900">{data?.stats?.in_progress || 0}</div>
              <div className="text-sm text-surface-500 mt-1">{t("กำลังดำเนินการ", "In Progress")}</div>
              <div className="text-xs text-brand-600 mt-3 font-medium">{t("ดูรายการ →", "View tickets →")}</div>
            </Link>
            <Link href={uatPath("/tickets?status=resolved")} className="block bg-white rounded-2xl border border-surface-200 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2" aria-label={t("เปิดรายการปัญหาที่เสร็จสิ้น", "Open resolved tickets") }>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center mb-3">
                <span className="text-emerald-600 text-lg">✅</span>
              </div>
              <div className="text-3xl font-bold text-surface-900">{data?.stats?.resolved || 0}</div>
              <div className="text-sm text-surface-500 mt-1">{t("แก้ไขแล้ว", "Resolved")}</div>
              <div className="text-xs text-brand-600 mt-3 font-medium">{t("ดูรายการ →", "View tickets →")}</div>
            </Link>
            <Link href={uatPath("/tickets?status=closed")} className="block bg-white rounded-2xl border border-surface-200 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2" aria-label={t("เปิดรายการปัญหาที่ปิดแล้ว", "Open closed tickets") }>
              <div className="w-10 h-10 rounded-xl bg-surface-200 flex items-center justify-center mb-3">
                <span className="text-surface-600 text-lg">📁</span>
              </div>
              <div className="text-3xl font-bold text-surface-900">{data?.stats?.closed || 0}</div>
              <div className="text-sm text-surface-500 mt-1">{t("ปิดงานแล้ว", "Closed")}</div>
              <div className="text-xs text-brand-600 mt-3 font-medium">{t("ดูรายการ →", "View tickets →")}</div>
            </Link>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-surface-800">📢 {t("ประกาศล่าสุด", "Latest Announcements")}</h2>
                <Link href={uatPath("/announcements")} className="text-sm text-brand-500 hover:underline">
                  {t("ดูทั้งหมด →", "View All →")}
                </Link>
              </div>
              <div className="space-y-3">
                {data?.announcements?.map((a: any) => (
                  <Link key={a.id} href={uatPath("/announcements")} className="block bg-white rounded-2xl border border-surface-200 shadow-sm p-4 hover:shadow-md hover:-translate-y-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2" aria-label={t("เปิดหน้าประกาศ", "Open announcements page") }>
                    <h3 className="font-medium text-surface-800 text-sm">{lang === "th" ? a.title_th : (a.title_en || a.title_th)}</h3>
                    <p className="text-xs text-surface-500 mt-1">{formatDate(a.published_at)}</p>
                    <p className="text-xs text-brand-600 mt-2 font-medium">{t("อ่านต่อ →", "Read more →")}</p>
                  </Link>
                ))}
                {(!data?.announcements || data.announcements.length === 0) && (
                  <p className="text-sm text-surface-500 p-4">{t("ไม่มีประกาศ", "No announcements")}</p>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-surface-800">📄 {t("เอกสาร", "Documents")}</h2>
                <Link href={uatPath("/documents")} className="text-sm text-brand-500 hover:underline">
                  {t("ดูทั้งหมด →", "View All →")}
                </Link>
              </div>
              <div className="space-y-3">
                {data?.documents?.map((d: any) => (
                  <a key={d.id} href={d.file_available ? uatPath(`/api/documents/${d.id}/download`) : uatPath("/documents")} className="bg-white rounded-2xl border border-surface-200 shadow-sm p-4 hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2" aria-label={t("เปิดหรือดาวน์โหลดเอกสาร", "Open or download document") }>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📄</span>
                      <div>
                        <h3 className="font-medium text-surface-800 text-sm">{lang === "th" ? d.title_th : (d.title_en || d.title_th)}</h3>
                        <p className="text-xs text-surface-500">{formatFileSize(d.file_size_bytes)}</p>
                      </div>
                    </div>
                    <span className="text-xs text-brand-500 hover:underline">{d.file_available ? t("ดาวน์โหลด", "Download") : t("ดูเอกสาร", "View")}</span>
                  </a>
                ))}
                {(!data?.documents || data.documents.length === 0) && (
                  <p className="text-sm text-surface-500 p-4">{t("ไม่มีเอกสาร", "No documents")}</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
