"use client";

import { useEffect, useState, useCallback } from "react";
import { useLanguage } from "@/components/LanguageContext";
import { DropdownGroups, fetchDropdownGroups, optionWithIcon } from "@/lib/dropdown-client";

export default function AnnouncementsPage() {
  const { lang } = useLanguage();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<any | null>(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [dropdownGroups, setDropdownGroups] = useState<DropdownGroups>({});

  const fetchAnnouncements = useCallback(async (cat: string) => {
    setLoading(true);
    try {
      const url = cat === "all" ? "/api/announcements" : `/api/announcements?category=${cat}`;
      const res = await fetch(url);
      const d = await res.json();
      setAnnouncements(d.announcements || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDropdownGroups(["announcement_category"]).then(setDropdownGroups).catch(console.error);
  }, []);

  useEffect(() => {
    fetchAnnouncements(activeCategory);
  }, [activeCategory, fetchAnnouncements]);

  useEffect(() => {
    if (!selectedAnnouncement) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedAnnouncement(null);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [selectedAnnouncement]);

  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString(lang === "th" ? "th-TH" : "en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  const categories = [
    { code: "all", label: t("ทั้งหมด", "All"), icon: "📋" },
    ...(dropdownGroups.announcement_category || [
      { code: "events", label_th: "กิจกรรม", label_en: "Events", icon: "🎉" },
      { code: "maintenance", label_th: "ซ่อมบำรุง", label_en: "Maintenance", icon: "🔧" },
      { code: "general", label_th: "ทั่วไป", label_en: "General", icon: "📢" },
    ]).map((cat) => ({ code: cat.code, label: lang === "th" ? cat.label_th : cat.label_en || cat.label_th, icon: cat.icon || "📢" })),
  ];

  const categoryLabel = (category?: string) => optionWithIcon(dropdownGroups, "announcement_category", category, lang, t("📢 ทั่วไป", "📢 General"));

  const announcementTitle = (a: any) => (lang === "th" ? a.title_th : a.title_en || a.title_th);
  const announcementContent = (a: any) =>
    (lang === "th" ? a.content_th : a.content_en || a.content_th) || t("ไม่มีรายละเอียดเพิ่มเติม", "No additional details");

  return (
    <div className="py-4">
      <h1 className="text-xl font-bold text-surface-900 mb-1">
        {t("ประกาศ ประชาสัมพันธ์", "Announcements & News")}
      </h1>
      <p className="text-sm text-surface-500 mb-4">
        {t("ข่าวสารและประกาศจากหมู่บ้าน", "News and announcements from the estate")}
      </p>

      {/* Filter tabs */}
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
      ) : announcements.length === 0 ? (
        <div className="text-center py-12 text-surface-500">
          {t("ไม่มีประกาศในหมวดนี้", "No announcements in this category")}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {announcements.map((a) => (
            <article
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedAnnouncement(a)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedAnnouncement(a);
                }
              }}
              className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            >
              <div className="aspect-video bg-surface-100 flex items-center justify-center">
                {a.image_available ? (
                  <img src={`/api/announcements/${a.id}/image`} alt={a.title_th} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <span className="text-4xl text-surface-300">📢</span>
                )}
              </div>
              <div className="p-4">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {a.is_pinned && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-brand-100 text-brand-700">
                      📌 {t("ปักหมุด", "Pinned")}
                    </span>
                  )}
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-surface-100 text-surface-600">
                    {categoryLabel(a.category)}
                  </span>
                </div>
                <h3 className="font-semibold text-surface-800 mb-1 text-sm leading-snug">
                  {announcementTitle(a)}
                </h3>
                <p className="text-xs text-surface-400">{formatDate(a.published_at)}</p>
                <p className="mt-2 text-xs font-medium text-brand-600">{t("แตะเพื่ออ่านรายละเอียด", "Tap to read details")}</p>
              </div>
            </article>
          ))}
        </div>
      )}

      {selectedAnnouncement && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setSelectedAnnouncement(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="announcement-detail-title"
        >
          <div
            className="bg-white w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] overflow-hidden rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-surface-100">
              <div className="min-w-0">
                <p className="text-xs text-surface-500">{categoryLabel(selectedAnnouncement.category)}</p>
                <h2 id="announcement-detail-title" className="font-bold text-surface-900 text-base leading-snug truncate">
                  {announcementTitle(selectedAnnouncement)}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAnnouncement(null)}
                className="shrink-0 w-9 h-9 rounded-full bg-surface-100 text-surface-600 hover:bg-surface-200 flex items-center justify-center"
                aria-label={t("ปิด", "Close")}
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto">
              <div className="aspect-video bg-surface-100 flex items-center justify-center">
                {selectedAnnouncement.image_available ? (
                  <img
                    src={`/api/announcements/${selectedAnnouncement.id}/image`}
                    alt={selectedAnnouncement.title_th}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-5xl text-surface-300">📢</span>
                )}
              </div>

              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {selectedAnnouncement.is_pinned && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-brand-100 text-brand-700">
                      📌 {t("ปักหมุด", "Pinned")}
                    </span>
                  )}
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-surface-100 text-surface-600">
                    {categoryLabel(selectedAnnouncement.category)}
                  </span>
                  <span className="text-xs text-surface-400">{formatDate(selectedAnnouncement.published_at)}</span>
                </div>

                <h3 className="text-lg font-bold text-surface-900 leading-snug mb-3">
                  {announcementTitle(selectedAnnouncement)}
                </h3>

                <div className="prose prose-sm max-w-none text-surface-700 whitespace-pre-wrap leading-7">
                  {announcementContent(selectedAnnouncement)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
