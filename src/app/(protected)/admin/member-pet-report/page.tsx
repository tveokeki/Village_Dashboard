"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/components/LanguageContext";

type HouseholdSummary = {
  web_user_id: string;
  house_number: string;
  resident_name: string;
  email?: string | null;
  member_count: number;
  pet_count: number;
  last_updated_at?: string | null;
};

type HouseholdMember = {
  id: string;
  web_user_id: string;
  house_number: string;
  resident_name: string;
  full_name: string;
  relationship: string;
  age?: number | null;
  image_path?: string | null;
  image_name?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type HouseholdPet = {
  id: string;
  web_user_id: string;
  house_number: string;
  resident_name: string;
  pet_name: string;
  pet_type: string;
  distinctive_features?: string | null;
  image_path?: string | null;
  image_name?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type ReportData = {
  totals: { households: number; members: number; pets: number };
  households: HouseholdSummary[];
  members: HouseholdMember[];
  pets: HouseholdPet[];
};

const UAT_BASE_PATH = process.env.NEXT_PUBLIC_UAT_BASE_PATH || "";
const uatPath = (path: string) => `${UAT_BASE_PATH}${path}`;

type TabKey = "summary" | "members" | "pets";

function formatDate(value?: string | null) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return "-";
  }
}

export default function MemberPetReportPage() {
  const { lang } = useLanguage();
  const t = useCallback((th: string, en: string) => (lang === "th" ? th : en), [lang]);
  const [data, setData] = useState<ReportData>({ totals: { households: 0, members: 0, pets: 0 }, households: [], members: [], pets: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [expandedHouseholdId, setExpandedHouseholdId] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(uatPath("/api/admin/member-pet-report"), { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load report");
      setData({
        totals: payload.totals || { households: 0, members: 0, pets: 0 },
        households: payload.households || [],
        members: payload.members || [],
        pets: payload.pets || [],
      });
    } catch (err: any) {
      setError(err.message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredHouseholds = useMemo(() => {
    if (!normalizedQuery) return data.households;
    return data.households.filter((item) =>
      [item.house_number, item.resident_name, item.email, String(item.member_count), String(item.pet_count)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [data.households, normalizedQuery]);

  const filteredMembers = useMemo(() => {
    if (!normalizedQuery) return data.members;
    return data.members.filter((item) =>
      [item.house_number, item.resident_name, item.full_name, item.relationship, item.age]
        .filter((v) => v !== undefined && v !== null)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [data.members, normalizedQuery]);

  const filteredPets = useMemo(() => {
    if (!normalizedQuery) return data.pets;
    return data.pets.filter((item) =>
      [item.house_number, item.resident_name, item.pet_name, item.pet_type, item.distinctive_features]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [data.pets, normalizedQuery]);

  const tabs: { key: TabKey; label: string; count: number; icon: string }[] = [
    { key: "summary", label: t("สรุปตามบ้าน", "House Summary"), count: filteredHouseholds.length, icon: "🏘️" },
    { key: "members", label: t("สมาชิก", "Members"), count: filteredMembers.length, icon: "👨‍👩‍👧‍👦" },
    { key: "pets", label: t("สัตว์เลี้ยง", "Pets"), count: filteredPets.length, icon: "🐾" },
  ];

  return (
    <div className="space-y-6">
      <section className="bg-gradient-to-br from-brand-600 to-brand-500 rounded-3xl p-6 text-white shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-white/80 uppercase tracking-wide">{t("รายงานผู้ดูแลระบบ", "Admin Report")}</p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold">{t("รายงานสมาชิกและสัตว์เลี้ยง", "Member & Pet Report")}</h1>
            <p className="mt-2 text-sm text-white/85 max-w-2xl">
              {t("ภาพรวมข้อมูลสมาชิกในบ้านและสัตว์เลี้ยงที่ลูกบ้านลงทะเบียนไว้ในหมู่บ้านสวนเอก", "Village-wide overview of registered household members and pets in Suan Eak.")}
            </p>
          </div>
          <button
            type="button"
            onClick={loadReport}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-brand-700 shadow-sm hover:bg-brand-50 disabled:opacity-60 active:scale-[0.98] transition-all"
          >
            🔄 {loading ? t("กำลังโหลด", "Loading") : t("รีเฟรช", "Refresh")}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2 md:gap-4">
        <div className="rounded-2xl border border-surface-200 bg-white p-3 sm:p-5 shadow-sm">
          <p className="text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wide">{t("บ้านที่มีข้อมูล", "Households")}</p>
          <p className="mt-1 text-xl sm:text-3xl font-extrabold text-surface-900 tabular-nums">{data.totals.households}</p>
        </div>
        <div className="rounded-2xl border border-surface-200 bg-white p-3 sm:p-5 shadow-sm">
          <p className="text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wide">{t("สมาชิกทั้งหมด", "Members")}</p>
          <p className="mt-1 text-xl sm:text-3xl font-extrabold text-surface-900 tabular-nums">{data.totals.members}</p>
        </div>
        <div className="rounded-2xl border border-surface-200 bg-white p-3 sm:p-5 shadow-sm">
          <p className="text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wide">{t("สัตว์เลี้ยงทั้งหมด", "Pets")}</p>
          <p className="mt-1 text-xl sm:text-3xl font-extrabold text-surface-900 tabular-nums">{data.totals.pets}</p>
        </div>
      </section>

      <section className="rounded-3xl border border-surface-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`shrink-0 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all ${
                  activeTab === tab.key ? "bg-brand-600 text-white shadow-sm" : "bg-surface-100 text-surface-600 hover:bg-brand-50 hover:text-brand-700"
                }`}
              >
                {tab.icon} {tab.label} <span className="tabular-nums">({tab.count})</span>
              </button>
            ))}
          </div>
          <label className="relative w-full md:w-80">
            <span className="sr-only">{t("ค้นหา", "Search")}</span>
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400">🔎</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("ค้นหาบ้าน/ชื่อ/ประเภท", "Search house/name/type")}
              className="w-full rounded-2xl border border-surface-300 bg-white py-3 pl-11 pr-4 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </div>

        {error && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
        {loading && <div className="mt-8 text-center text-sm text-surface-500">{t("กำลังโหลดรายงาน...", "Loading report...")}</div>}

        {!loading && !error && activeTab === "summary" && (
          <div className="mt-5 overflow-x-auto rounded-2xl border border-surface-200 bg-white shadow-sm">
            <table className="min-w-[860px] w-full border-collapse text-sm">
              <thead className="bg-surface-50 text-xs font-bold uppercase tracking-wide text-surface-500">
                <tr className="border-b border-surface-200">
                  <th className="w-28 px-4 py-3 text-left">{t("บ้านเลขที่", "House")}</th>
                  <th className="px-4 py-3 text-left">{t("ผู้ลงทะเบียน", "Registrant")}</th>
                  <th className="w-28 px-4 py-3 text-center">{t("สมาชิก", "Members")}</th>
                  <th className="w-28 px-4 py-3 text-center">{t("สัตว์เลี้ยง", "Pets")}</th>
                  <th className="w-48 px-4 py-3 text-left">{t("อัปเดตล่าสุด", "Last Updated")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {filteredHouseholds.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm font-medium text-surface-500">
                      {t("ไม่พบข้อมูล", "No records found")}
                    </td>
                  </tr>
                ) : filteredHouseholds.map((item) => {
                  const isExpanded = expandedHouseholdId === item.web_user_id;
                  const householdMembers = data.members.filter((member) => member.web_user_id === item.web_user_id);
                  const householdPets = data.pets.filter((pet) => pet.web_user_id === item.web_user_id);
                  return (
                    <Fragment key={item.web_user_id}>
                      <tr
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() => setExpandedHouseholdId(isExpanded ? null : item.web_user_id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setExpandedHouseholdId(isExpanded ? null : item.web_user_id);
                          }
                        }}
                        className={`cursor-pointer transition-colors ${isExpanded ? "bg-brand-50/60" : "hover:bg-brand-50/40"}`}
                      >
                        <td className="px-4 py-3 align-middle">
                          <span className="inline-flex min-w-16 items-center justify-center rounded-xl bg-brand-50 px-3 py-1.5 font-extrabold text-brand-700 tabular-nums">
                            {item.house_number}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="min-w-0">
                            <p className="font-semibold text-surface-900 break-words">{item.resident_name}</p>
                            {item.email && <p className="mt-0.5 text-xs text-surface-500 break-words">{item.email}</p>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center align-middle">
                          <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-emerald-50 px-3 font-extrabold text-emerald-700 tabular-nums">
                            {item.member_count}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center align-middle">
                          <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-amber-50 px-3 font-extrabold text-amber-700 tabular-nums">
                            {item.pet_count}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-middle text-surface-600 whitespace-nowrap">
                          <div className="flex items-center justify-between gap-3">
                            <span>{formatDate(item.last_updated_at)}</span>
                            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm transition-transform ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true">
                              ▾
                            </span>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-surface-50/80">
                          <td colSpan={5} className="px-4 py-5">
                            <div className="rounded-2xl border border-brand-100 bg-white p-4 shadow-sm">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <h3 className="text-base font-extrabold text-surface-900">
                                    {t("รายละเอียดบ้านเลขที่", "House details")} {item.house_number}
                                  </h3>
                                  <p className="mt-1 text-sm text-surface-500">
                                    {item.resident_name}{item.email ? ` • ${item.email}` : ""}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedHouseholdId(null);
                                  }}
                                  className="self-start rounded-xl bg-surface-100 px-3 py-1.5 text-xs font-bold text-surface-600 hover:bg-surface-200"
                                >
                                  {t("ซ่อนรายละเอียด", "Hide details")}
                                </button>
                              </div>

                              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4">
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <h4 className="font-extrabold text-surface-900">👨‍👩‍👧‍👦 {t("สมาชิกในบ้าน", "Household Members")}</h4>
                                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700 tabular-nums">{householdMembers.length}</span>
                                  </div>
                                  {householdMembers.length === 0 ? (
                                    <p className="rounded-xl border border-dashed border-surface-300 bg-white px-3 py-4 text-center text-sm font-medium text-surface-500">
                                      {t("ยังไม่มีข้อมูลสมาชิก", "No member records")}
                                    </p>
                                  ) : (
                                    <div className="space-y-2">
                                      {householdMembers.map((member) => (
                                        <div key={member.id} className="flex items-start gap-3 rounded-xl bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-surface-100">
                                          <PhotoThumb src={member.image_path} alt={member.full_name} fallback="👤" tone="emerald" size="sm" />
                                          <div className="min-w-0 flex-1">
                                            <div className="font-bold text-surface-900 break-words">{member.full_name}</div>
                                            <div className="mt-0.5 text-xs text-surface-500">
                                              {member.relationship || "-"} • {t("อายุ", "Age")} {member.age === null || member.age === undefined ? "-" : member.age}
                                            </div>
                                            {member.image_name && <div className="mt-1 truncate text-[11px] text-surface-400">📷 {member.image_name}</div>}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4">
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <h4 className="font-extrabold text-surface-900">🐾 {t("สัตว์เลี้ยง", "Pets")}</h4>
                                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-extrabold text-amber-700 tabular-nums">{householdPets.length}</span>
                                  </div>
                                  {householdPets.length === 0 ? (
                                    <p className="rounded-xl border border-dashed border-surface-300 bg-white px-3 py-4 text-center text-sm font-medium text-surface-500">
                                      {t("ยังไม่มีข้อมูลสัตว์เลี้ยง", "No pet records")}
                                    </p>
                                  ) : (
                                    <div className="space-y-2">
                                      {householdPets.map((pet) => (
                                        <div key={pet.id} className="flex items-start gap-3 rounded-xl bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-surface-100">
                                          <PhotoThumb src={pet.image_path} alt={pet.pet_name} fallback="🐾" tone="amber" size="sm" />
                                          <div className="min-w-0 flex-1">
                                            <div className="font-bold text-surface-900 break-words">{pet.pet_name}</div>
                                            <div className="mt-0.5 text-xs text-surface-500">{pet.pet_type || "-"}</div>
                                            {pet.distinctive_features && <div className="mt-1 text-xs text-surface-600 break-words">{pet.distinctive_features}</div>}
                                            {pet.image_name && <div className="mt-1 truncate text-[11px] text-surface-400">📷 {pet.image_name}</div>}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && activeTab === "members" && (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredMembers.length === 0 ? <EmptyCard label={t("ไม่พบข้อมูลสมาชิก", "No member records found")} /> : filteredMembers.map((item) => (
              <article key={item.id} className="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm hover:border-brand-200 transition-colors">
                <div className="flex items-start gap-3">
                  <PhotoThumb src={item.image_path} alt={item.full_name} fallback="👤" tone="emerald" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-extrabold text-surface-900 break-words">{item.full_name}</h3>
                    <p className="text-sm text-surface-500">{t("บ้านเลขที่", "House")} {item.house_number} • {item.resident_name}</p>
                    {item.image_name && <p className="mt-1 truncate text-xs text-surface-400">📷 {item.image_name}</p>}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <InfoPill label={t("ความสัมพันธ์", "Relationship")} value={item.relationship} />
                  <InfoPill label={t("อายุ", "Age")} value={item.age === null || item.age === undefined ? "-" : `${item.age}`} />
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && !error && activeTab === "pets" && (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredPets.length === 0 ? <EmptyCard label={t("ไม่พบข้อมูลสัตว์เลี้ยง", "No pet records found")} /> : filteredPets.map((item) => (
              <article key={item.id} className="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm hover:border-brand-200 transition-colors">
                <div className="flex items-start gap-3">
                  <PhotoThumb src={item.image_path} alt={item.pet_name} fallback="🐾" tone="amber" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-extrabold text-surface-900 break-words">{item.pet_name}</h3>
                    <p className="text-sm text-surface-500">{t("บ้านเลขที่", "House")} {item.house_number} • {item.resident_name}</p>
                    {item.image_name && <p className="mt-1 truncate text-xs text-surface-400">📷 {item.image_name}</p>}
                  </div>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <InfoPill label={t("ประเภท", "Type")} value={item.pet_type} />
                  {item.distinctive_features && <InfoPill label={t("ลักษณะเด่น", "Distinctive Features")} value={item.distinctive_features} />}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Label({ text }: { text: string }) {
  return <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-surface-400 md:hidden">{text}</div>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="px-4 py-10 text-center text-sm font-medium text-surface-500">{label}</div>;
}

function EmptyCard({ label }: { label: string }) {
  return <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-surface-300 bg-surface-50 px-4 py-10 text-center text-sm font-medium text-surface-500">{label}</div>;
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-50 px-3 py-2">
      <div className="text-[11px] font-bold uppercase tracking-wide text-surface-400">{label}</div>
      <div className="mt-0.5 break-words font-semibold text-surface-800">{value}</div>
    </div>
  );
}

function PhotoThumb({
  src,
  alt,
  fallback,
  tone = "emerald",
  size = "md",
}: {
  src?: string | null;
  alt: string;
  fallback: string;
  tone?: "emerald" | "amber";
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "h-12 w-12 rounded-xl" : "h-11 w-11 rounded-2xl";
  const bgClass = tone === "amber" ? "bg-amber-50" : "bg-emerald-50";
  return (
    <div className={`${sizeClass} ${bgClass} flex shrink-0 items-center justify-center overflow-hidden border border-surface-200 text-xl`}>
      {src ? <img src={uatPath(src)} alt={alt} className="h-full w-full object-cover" loading="lazy" /> : fallback}
    </div>
  );
}
