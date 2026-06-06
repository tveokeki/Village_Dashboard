"use client";

export type FinanceTab = { key: string; label: string };

export default function FinanceTabs({ tabs, active, onChange }: { tabs: FinanceTab[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="overflow-x-auto no-scrollbar -mx-4 px-4 mb-6">
      <div className="flex gap-2 min-w-max">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              active === tab.key
                ? "bg-brand-500 text-white shadow-sm"
                : "bg-white border border-surface-200 text-surface-600 hover:bg-surface-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
