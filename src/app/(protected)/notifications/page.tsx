"use client";

import { useEffect, useState, useMemo } from "react";
import { useLanguage } from "@/components/LanguageContext";
import Toast from "@/components/Toast";

const UAT_BASE_PATH = process.env.NEXT_PUBLIC_UAT_BASE_PATH || "";
const uatPath = (path: string) => `${UAT_BASE_PATH}${path}`;

export default function NotificationsPage() {
  const { lang } = useLanguage();
  const [items, setItems] = useState<any[]>([]);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  });
  const [toDate, setToDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [currentPage, setCurrentPage] = useState(1);

  const filteredItems = useMemo(() => {
    return items.filter((n) => {
      const dateStr = n.created_at ? new Date(n.created_at).toISOString().split("T")[0] : "";
      return dateStr >= fromDate && dateStr <= toDate;
    });
  }, [items, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / 10));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [filteredItems, totalPages, currentPage]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * 10;
    return filteredItems.slice(start, start + 10);
  }, [filteredItems, currentPage]);

  async function load() {
    setLoading(true);
    const d = await fetch(uatPath("/api/notifications?mine=1")).then(r => r.json()).catch(() => ({ notifications: [] }));
    setItems(d.notifications || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function markRead(id: string) {
    await fetch(uatPath(`/api/notifications/${id}/read`), { method: "POST" });
    setToast(t("บันทึกว่าอ่านแล้วเรียบร้อย", "Saved as read successfully"));
    await load();
  }

  return <div className="py-4 space-y-4">
    <Toast message={toast} onClose={() => setToast("")} />
    <div>
      <h1 className="text-xl font-bold text-surface-900">🔔 {t("การแจ้งเตือน", "Notifications")}</h1>
      <p className="text-sm text-surface-500">{t("ข่าวสารและการแจ้งเตือนสำหรับคุณ", "News and notifications for you")}</p>
    </div>

    {/* Date Filters */}
    <div className="bg-white p-4 rounded-3xl border border-surface-200 shadow-sm grid grid-cols-2 gap-3 mb-4">
      <div>
        <label className="block text-xs font-medium text-surface-500 mb-1">{t("ตั้งแต่วันที่", "From Date")}</label>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => {
            setFromDate(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full px-3.5 py-2.5 bg-surface-50 border border-surface-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-semibold"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-surface-500 mb-1">{t("ถึงวันที่", "To Date")}</label>
        <input
          type="date"
          value={toDate}
          onChange={(e) => {
            setToDate(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full px-3.5 py-2.5 bg-surface-50 border border-surface-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all font-semibold"
        />
      </div>
    </div>

    {loading ? <div className="text-center py-12 text-surface-500">{t("กำลังโหลด...", "Loading...")}</div> : filteredItems.length === 0 ? <div className="text-center py-12 text-surface-500">{t("ไม่มีการแจ้งเตือนในช่วงเวลาที่เลือก", "No notifications in selected date range")}</div> : (
      <>
      <div className="space-y-3">
      {paginatedItems.map(n => <div key={n.id} className={`card ${n.is_read ? "opacity-70" : "border-brand-200"}`}>
        <div className="flex justify-between gap-3">
          <div>
            <h3 className="font-semibold text-sm text-surface-900">{lang === "th" ? n.title_th : n.title_en || n.title_th}</h3>
            <p className="text-xs text-surface-500 mt-1">{new Date(n.created_at).toLocaleString(lang === "th" ? "th-TH" : "en-US")}</p>
          </div>
          {!n.is_read && <button onClick={() => markRead(n.id)} className="text-xs text-brand-600 shrink-0">{t("อ่านแล้ว", "Mark read")}</button>}
        </div>
        <p className="text-sm text-surface-700 mt-3">{lang === "th" ? n.message_th : n.message_en || n.message_th}</p>
        {n.target_url && <a href={n.target_url.startsWith("/") ? uatPath(n.target_url) : n.target_url} className="inline-block mt-3 text-sm text-brand-600 hover:underline">{t("เปิดดู", "Open")}</a>}
      </div>)}
      </div>
      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-surface-200">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="px-4 py-2 border border-surface-200 rounded-xl text-xs font-semibold bg-white text-surface-600 hover:bg-surface-50 disabled:opacity-50 transition-colors"
          >
            {t("ก่อนหน้า", "Previous")}
          </button>
          <span className="text-xs text-surface-500 font-medium">
            {t(`หน้า ${currentPage} จาก ${totalPages}`, `Page ${currentPage} of ${totalPages}`)}
          </span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="px-4 py-2 border border-surface-200 rounded-xl text-xs font-semibold bg-white text-surface-600 hover:bg-surface-50 disabled:opacity-50 transition-colors"
          >
            {t("ถัดไป", "Next")}
          </button>
        </div>
      )}
      </>
    )}
  </div>;
}
