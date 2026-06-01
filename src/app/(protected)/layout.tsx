"use client";

import Sidebar from "@/components/Sidebar";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-50 lg:flex">
      <Sidebar />
      <TopNav />
      {/* Mobile needs bottom padding for fixed bottom nav; desktop uses two-column layout beside sidebar. */}
      <main className="flex-1 min-w-0 pt-14 pb-20 lg:pb-10 px-4 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
