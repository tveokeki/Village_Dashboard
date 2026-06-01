export type Lang = "th" | "en";

export type DropdownOption = {
  code: string;
  label_th: string;
  label_en: string;
  icon?: string | null;
  color_class?: string | null;
  sort_order?: number;
};

export type DropdownGroups = Record<string, DropdownOption[]>;

export function optionLabel(option: DropdownOption | undefined, lang: Lang, fallback?: string) {
  if (!option) return fallback || "";
  return lang === "th" ? option.label_th : option.label_en || option.label_th;
}

export function optionText(groups: DropdownGroups, group: string, code: string | null | undefined, lang: Lang, fallback?: string) {
  if (!code) return fallback || "-";
  const option = groups[group]?.find((item) => item.code === code);
  return optionLabel(option, lang, fallback || code);
}

export function optionWithIcon(groups: DropdownGroups, group: string, code: string | null | undefined, lang: Lang, fallback?: string) {
  if (!code) return fallback || "-";
  const option = groups[group]?.find((item) => item.code === code);
  if (!option) return fallback || code;
  const label = optionLabel(option, lang, code);
  return option.icon ? `${option.icon} ${label}` : label;
}

export function optionClass(groups: DropdownGroups, group: string, code: string | null | undefined, fallback = "bg-surface-200 text-surface-700") {
  const option = groups[group]?.find((item) => item.code === code);
  return option?.color_class || fallback;
}

const UAT_BASE_PATH = "/uat";

const uatPath = (path: string) => `${UAT_BASE_PATH}${path}`;

export async function fetchDropdownGroups(groupKeys: string[]): Promise<DropdownGroups> {
  const res = await fetch(uatPath(`/api/dropdown-options?groups=${encodeURIComponent(groupKeys.join(","))}`));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load dropdown options");
  return data.groups || {};
}
