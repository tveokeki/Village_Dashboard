"use client";

export default function FinancePageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-surface-900 mb-1 break-words">{title}</h1>
        <p className="text-sm text-surface-500 break-words">{description}</p>
      </div>
      {children ? <div className="flex flex-col sm:flex-row gap-2 shrink-0">{children}</div> : null}
    </div>
  );
}
