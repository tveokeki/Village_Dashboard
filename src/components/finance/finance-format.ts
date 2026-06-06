export const UAT_BASE_PATH = process.env.NEXT_PUBLIC_UAT_BASE_PATH || "";
export const uatPath = (path: string) => `${UAT_BASE_PATH}${path}`;

export function formatMoney(value: any, lang: "th" | "en") {
  return Number(value || 0).toLocaleString(lang === "th" ? "th-TH" : "en-US", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 2,
  });
}

export function formatDate(value: any, lang: "th" | "en") {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(lang === "th" ? "th-TH" : "en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function numberValue(value: any) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}
