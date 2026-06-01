import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/components/LanguageContext";

export const metadata: Metadata = {
  title: "สวนเอก เลคปาร์ควิลล่า | Suan Eak Lake Park Villa",
  description: "ระบบจัดการหมู่บ้าน สวนเอก เลคปาร์ควิลล่า - Condominium Management System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-screen">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
