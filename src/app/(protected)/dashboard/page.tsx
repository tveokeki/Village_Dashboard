"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { useLanguage } from "@/components/LanguageContext";

export default function DashboardPage() {
  const { lang } = useLanguage();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
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
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center mb-3">
                <span className="text-amber-600 text-lg">⏳</span>
              </div>
              <div className="text-3xl font-bold text-surface-900">{data?.stats?.received || 0}</div>
              <div className="text-sm text-surface-500 mt-1">{t("รอดำเนินการ", "Pending")}</div>
            </div>
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center mb-3">
                <span className="text-blue-600 text-lg">🔧</span>
              </div>
              <div className="text-3xl font-bold text-surface-900">{data?.stats?.in_progress || 0}</div>
              <div className="text-sm text-surface-500 mt-1">{t("กำลังแก้ไข", "In Progress")}</div>
            </div>
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center mb-3">
                <span className="text-emerald-600 text-lg">✅</span>
              </div>
              <div className="text-3xl font-bold text-surface-900">{data?.stats?.resolved || 0}</div>
              <div className="text-sm text-surface-500 mt-1">{t("เสร็จสิ้น", "Resolved")}</div>
            </div>
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-surface-200 flex items-center justify-center mb-3">
                <span className="text-surface-600 text-lg">📁</span>
              </div>
              <div className="text-3xl font-bold text-surface-900">{data?.stats?.closed || 0}</div>
              <div className="text-sm text-surface-500 mt-1">{t("ปิด", "Closed")}</div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-surface-800">📢 {t("ประกาศล่าสุด", "Latest Announcements")}</h2>
                <Link href="/announcements" className="text-sm text-brand-500 hover:underline">
                  {t("ดูทั้งหมด →", "View All →")}
                </Link>
              </div>
              <div className="space-y-3">
                {data?.announcements?.map((a: any) => (
                  <div key={a.id} className="bg-white rounded-2xl border border-surface-200 shadow-sm p-4 hover:shadow-md transition-shadow">
                    <h3 className="font-medium text-surface-800 text-sm">{lang === "th" ? a.title_th : (a.title_en || a.title_th)}</h3>
                    <p className="text-xs text-surface-500 mt-1">{formatDate(a.published_at)}</p>
                  </div>
                ))}
                {(!data?.announcements || data.announcements.length === 0) && (
                  <p className="text-sm text-surface-500 p-4">{t("ไม่มีประกาศ", "No announcements")}</p>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-surface-800">📄 {t("เอกสาร", "Documents")}</h2>
                <Link href="/documents" className="text-sm text-brand-500 hover:underline">
                  {t("ดูทั้งหมด →", "View All →")}
                </Link>
              </div>
              <div className="space-y-3">
                {data?.documents?.map((d: any) => (
                  <div key={d.id} className="bg-white rounded-2xl border border-surface-200 shadow-sm p-4 hover:shadow-md transition-shadow flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📄</span>
                      <div>
                        <h3 className="font-medium text-surface-800 text-sm">{lang === "th" ? d.title_th : (d.title_en || d.title_th)}</h3>
                        <p className="text-xs text-surface-500">{formatFileSize(d.file_size_bytes)}</p>
                      </div>
                    </div>
                    <button className="text-xs text-brand-500 hover:underline">{t("ดาวน์โหลด", "Download")}</button>
                  </div>
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
