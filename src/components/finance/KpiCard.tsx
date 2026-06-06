"use client";

export default function KpiCard({
  label,
  value,
  hint,
  tone = "brand",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "brand" | "emerald" | "amber" | "red" | "blue" | "surface";
}) {
  const tones: Record<string, string> = {
    brand: "bg-brand-50 text-brand-700 border-brand-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    red: "bg-red-50 text-red-700 border-red-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    surface: "bg-surface-50 text-surface-700 border-surface-200",
  };
  return (
    <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-4 min-w-0">
      <div className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{label}</div>
      <div className="mt-3 text-xl lg:text-2xl font-bold text-surface-900 tabular-nums break-words">{value}</div>
      {hint ? <div className="mt-1 text-xs text-surface-500 break-words">{hint}</div> : null}
    </div>
  );
}
