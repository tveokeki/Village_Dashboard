"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageContext";
import Toast from "@/components/Toast";

export default function NotificationsPage() {
  const { lang } = useLanguage();
  const [items, setItems] = useState<any[]>([]);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const t = (th: string, en: string) => (lang === "th" ? th : en);

  async function load() {
    setLoading(true);
    const d = await fetch("/api/notifications?mine=1").then(r => r.json()).catch(() => ({ notifications: [] }));
    setItems(d.notifications || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    setToast(t("บันทึกว่าอ่านแล้วเรียบร้อย", "Saved as read successfully"));
    await load();
  }

  return <div className="py-4 space-y-4">
    <Toast message={toast} onClose={() => setToast("")} />
    <div>
      <h1 className="text-xl font-bold text-surface-900">🔔 {t("การแจ้งเตือน", "Notifications")}</h1>
      <p className="text-sm text-surface-500">{t("ข่าวสารและการแจ้งเตือนสำหรับคุณ", "News and notifications for you")}</p>
    </div>
    {loading ? <div className="text-center py-12 text-surface-500">{t("กำลังโหลด...", "Loading...")}</div> : items.length === 0 ? <div className="text-center py-12 text-surface-500">{t("ยังไม่มีการแจ้งเตือน", "No notifications")}</div> : <div className="space-y-3">
      {items.map(n => <div key={n.id} className={`card ${n.is_read ? "opacity-70" : "border-brand-200"}`}>
        <div className="flex justify-between gap-3">
          <div>
            <h3 className="font-semibold text-sm text-surface-900">{lang === "th" ? n.title_th : n.title_en || n.title_th}</h3>
            <p className="text-xs text-surface-500 mt-1">{new Date(n.created_at).toLocaleString(lang === "th" ? "th-TH" : "en-US")}</p>
          </div>
          {!n.is_read && <button onClick={() => markRead(n.id)} className="text-xs text-brand-600 shrink-0">{t("อ่านแล้ว", "Mark read")}</button>}
        </div>
        <p className="text-sm text-surface-700 mt-3">{lang === "th" ? n.message_th : n.message_en || n.message_th}</p>
        {n.target_url && <a href={n.target_url} className="inline-block mt-3 text-sm text-brand-600 hover:underline">{t("เปิดดู", "Open")}</a>}
      </div>)}
    </div>}
  </div>;
}
