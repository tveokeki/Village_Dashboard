"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useLanguage } from "@/components/LanguageContext";
import { useCurrentUser } from "@/lib/current-user-client";
import { formatMoney, formatDate, uatPath } from "@/components/finance/finance-format";
import { CheckCircle2, AlertTriangle, Clock, HelpCircle, User, ArrowRight, ShieldAlert } from "lucide-react";

type FeeHistoryItem = {
  month: string;
  has_bill: boolean;
  id?: string;
  period_start: string;
  period_end: string;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  status: "paid" | "overdue" | "pending" | "waived" | "cancelled" | "none";
  paid_at?: string | null;
  notes?: string | null;
};

type APIResponse = {
  success: boolean;
  hasHouseNumber: boolean;
  hasMember: boolean;
  houseNumber?: string;
  memberName?: string;
  history: FeeHistoryItem[];
  error?: string;
};

export default function CommonFeeHistoryPage() {
  const { lang } = useLanguage();
  const { user, loading: userLoading } = useCurrentUser();
  const [data, setData] = useState<APIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const t = (th: string, en: string) => (lang === "th" ? th : en);

  const fetchHistory = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(uatPath("/api/me/common-fee-history"));
      if (!res.ok) {
        throw new Error(t("ไม่สามารถดึงข้อมูลประวัติค่าส่วนกลางได้", "Failed to fetch common fee history"));
      }
      const json: APIResponse = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }
      setData(json);
    } catch (err: any) {
      setError(err.message || t("เกิดข้อผิดพลาดในการโหลดข้อมูล", "An error occurred while loading data"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userLoading && user) {
      fetchHistory();
    }
  }, [user, userLoading]);

  // Helper to format Thai/English month name
  const getMonthLabel = (monthStr: string) => {
    const d = new Date(monthStr + "T00:00:00");
    if (lang === "th") {
      const monthsTh = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
      ];
      return `${monthsTh[d.getMonth()]} ${d.getFullYear() + 543}`;
    } else {
      const monthsEn = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];
      return `${monthsEn[d.getMonth()]} ${d.getFullYear()}`;
    }
  };

  // Determine item's detailed category for visual presentation
  const getItemCategory = (item: FeeHistoryItem) => {
    const { status, due_date } = item;

    if (status === "paid" || status === "waived") {
      return {
        type: "paid" as const,
        label: status === "waived" ? t("ยกเว้นค่าบริการ", "Waived") : t("ชำระเงินแล้ว", "Paid"),
        colorClass: "border-emerald-500 bg-emerald-50/10 text-emerald-800",
        pillClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
        icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
      };
    }

    if (status === "overdue") {
      return {
        type: "overdue" as const,
        label: t("ยังไม่จ่าย (เกินกำหนด)", "Overdue"),
        colorClass: "border-red-500 bg-red-50/10 text-red-800",
        pillClass: "bg-red-50 text-red-700 border-red-200",
        icon: <ShieldAlert className="w-5 h-5 text-red-600" />,
      };
    }

    if (status === "pending" || status === "cancelled") {
      // Check if due_date is in the past to label it as overdue
      const dueDate = new Date(due_date + "T23:59:59");
      const isPastDue = dueDate < new Date();

      if (isPastDue) {
        return {
          type: "overdue" as const,
          label: t("ยังไม่จ่าย (เกินกำหนด)", "Overdue"),
          colorClass: "border-red-500 bg-red-50/10 text-red-800",
          pillClass: "bg-red-50 text-red-700 border-red-200",
          icon: <ShieldAlert className="w-5 h-5 text-red-600" />,
        };
      } else {
        return {
          type: "pending" as const,
          label: t("รอชำระ (ยังไม่เกินกำหนด)", "Pending (Not Overdue)"),
          colorClass: "border-amber-500 bg-amber-50/10 text-amber-800",
          pillClass: "bg-amber-50 text-amber-700 border-amber-200",
          icon: <Clock className="w-5 h-5 text-amber-600" />,
        };
      }
    }

    return {
      type: "none" as const,
      label: t("ยังไม่มีข้อมูลรอบบิล", "No Billing Cycle"),
      colorClass: "border-slate-300 bg-slate-50 text-slate-500",
      pillClass: "bg-slate-50 text-slate-500 border-slate-200",
      icon: <HelpCircle className="w-5 h-5 text-slate-400" />,
    };
  };

  // Compute dynamic stats summary
  const stats = useMemo(() => {
    if (!data?.history) return { paidCount: 0, overdueCount: 0, pendingCount: 0 };
    let paidCount = 0;
    let overdueCount = 0;
    let pendingCount = 0;

    data.history.forEach((item) => {
      const cat = getItemCategory(item);
      if (cat.type === "paid") paidCount++;
      else if (cat.type === "overdue") overdueCount++;
      else if (cat.type === "pending") pendingCount++;
    });

    return { paidCount, overdueCount, pendingCount };
  }, [data]);

  if (userLoading || (loading && !data)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
        <p className="mt-4 text-surface-500 text-sm">{t("กำลังโหลดข้อมูลประวัติค่าส่วนกลาง...", "Loading common fee history...")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center max-w-lg mx-auto my-8">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-red-800 mb-1">{t("เกิดข้อผิดพลาดในการดึงข้อมูล", "Failed to Load Data")}</h3>
        <p className="text-sm text-red-600 mb-4">{error}</p>
        <button onClick={fetchHistory} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-95">
          {t("ลองใหม่อีกครั้ง", "Try Again")}
        </button>
      </div>
    );
  }

  // Case 1: No house number in profile
  if (data && !data.hasHouseNumber) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-surface-200 p-8 text-center shadow-lg">
        <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-amber-100">
          <User className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-extrabold text-surface-900 mb-2">{t("ยังไม่ได้เพิ่มข้อมูลบ้านเลขที่", "House Number Missing")}</h2>
        <p className="text-sm text-surface-500 leading-relaxed mb-8">
          {t(
            "กรุณาเพิ่มข้อมูลบ้านเลขที่ในหน้าโปรไฟล์ของคุณก่อน จึงจะสามารถแสดงประวัติการจ่ายเงินค่าส่วนกลางประจำบ้านของคุณได้",
            "Please add your house number in your profile first to view the common fee payment history for your home."
          )}
        </p>
        <Link
          href={uatPath("/profile")}
          className="flex items-center justify-center gap-2 w-full px-5 py-3 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
        >
          <span>{t("ไปหน้าแก้ไขโปรไฟล์", "Go to Profile Settings")}</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  // Case 2: Has house number but no member is matched in DB
  if (data && !data.hasMember) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-surface-200 p-8 text-center shadow-lg">
        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-red-100">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-xl font-extrabold text-surface-900 mb-2">{t("ไม่พบข้อมูลทะเบียนสมาชิก", "Resident Profile Not Found")}</h2>
        <p className="text-sm text-surface-500 leading-relaxed mb-4">
          {t(
            `ไม่พบข้อมูลทะเบียนบ้านเลขที่ "${data.houseNumber}" ในระบบทะเบียนค่าส่วนกลาง`,
            `Could not find registration for house number "${data.houseNumber}" in the common fee registry.`
          )}
        </p>
        <p className="text-xs text-surface-400 leading-relaxed mb-8">
          {t(
            "กรุณาตรวจสอบความถูกต้องของบ้านเลขที่ในหน้าโปรไฟล์ หรือติดต่อสำนักงานนิติบุคคลเพื่อตรวจสอบความถูกต้องของระบบสมาชิก",
            "Please check your house number spelling in your profile or contact the juristic office to verify your resident listing."
          )}
        </p>
        <div className="flex gap-3">
          <Link
            href={uatPath("/profile")}
            className="flex-1 px-4 py-2.5 rounded-xl border border-surface-300 text-surface-700 font-bold text-xs hover:bg-surface-50 transition-all text-center"
          >
            {t("แก้ไขโปรไฟล์", "Edit Profile")}
          </Link>
          <a
            href="https://line.me"
            target="_blank"
            rel="noreferrer"
            className="flex-1 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-sm text-center"
          >
            {t("ติดต่อสำนักงาน", "Contact Office")}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-surface-900">{t("ประวัติการจ่ายเงินค่าส่วนกลาง", "Common Fee History")}</h1>
          <p className="text-sm text-surface-500 mt-1">
            {t(
              `บ้านเลขที่ ${data?.houseNumber || "-"} | สมาชิก: ${data?.memberName || "-"}`,
              `House No: ${data?.houseNumber || "-"} | Owner: ${data?.memberName || "-"}`
            )}
          </p>
        </div>
      </div>

      {/* KPI Stats Panel */}
      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-6">
        <div className="bg-white border border-surface-200 rounded-2xl p-3 md:p-5 flex flex-col items-center justify-center text-center shadow-sm">
          <span className="text-[10px] md:text-xs font-semibold text-emerald-600 tracking-wider uppercase mb-1">
            {t("ชำระแล้ว", "Paid")}
          </span>
          <span className="text-lg md:text-3xl font-black text-emerald-700">
            {stats.paidCount}
          </span>
          <span className="text-[9px] md:text-xs text-surface-400 mt-0.5">
            {t("เดือน", "months")}
          </span>
        </div>

        <div className="bg-white border border-surface-200 rounded-2xl p-3 md:p-5 flex flex-col items-center justify-center text-center shadow-sm">
          <span className="text-[10px] md:text-xs font-semibold text-red-600 tracking-wider uppercase mb-1">
            {t("ค้างชำระเกินกำหนด", "Overdue")}
          </span>
          <span className="text-lg md:text-3xl font-black text-red-700">
            {stats.overdueCount}
          </span>
          <span className="text-[9px] md:text-xs text-surface-400 mt-0.5">
            {t("เดือน", "months")}
          </span>
        </div>

        <div className="bg-white border border-surface-200 rounded-2xl p-3 md:p-5 flex flex-col items-center justify-center text-center shadow-sm">
          <span className="text-[10px] md:text-xs font-semibold text-amber-600 tracking-wider uppercase mb-1">
            {t("รอชำระเงิน", "Pending")}
          </span>
          <span className="text-lg md:text-3xl font-black text-amber-700">
            {stats.pendingCount}
          </span>
          <span className="text-[9px] md:text-xs text-surface-400 mt-0.5">
            {t("เดือน", "months")}
          </span>
        </div>
      </div>

      {/* History List */}
      <div className="space-y-3">
        {data?.history && data.history.length > 0 ? (
          data.history.map((item, idx) => {
            const cat = getItemCategory(item);
            return (
              <div
                key={item.month}
                className={`bg-white rounded-2xl border border-surface-200 border-l-4 ${cat.colorClass} shadow-sm p-4 hover:shadow-md transition-all duration-200`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-surface-900 text-sm md:text-base">
                        {getMonthLabel(item.month)}
                      </span>
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] md:text-xs font-bold leading-none ${cat.pillClass}`}>
                        {cat.label}
                      </span>
                    </div>

                    <div className="text-[11px] md:text-xs text-surface-500 space-y-0.5 pt-1">
                      {item.has_bill ? (
                        <>
                          <div className="flex items-center gap-1">
                            <span>📅 {t("กำหนดชำระ:", "Due Date:")}</span>
                            <span className="font-medium text-surface-700">{formatDate(item.due_date, lang)}</span>
                          </div>
                          {item.status === "paid" && item.paid_at && (
                            <div className="flex items-center gap-1 text-emerald-700">
                              <span>✅ {t("วันที่จ่าย:", "Paid Date:")}</span>
                              <span className="font-medium">{formatDate(item.paid_at, lang)}</span>
                            </div>
                          )}
                          {item.notes && (
                            <div className="text-surface-400 italic text-[10px] md:text-xs mt-1">
                              * {item.notes}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-surface-400 italic">
                          {t("* ยังไม่มีการสร้างรอบการเรียกเก็บเงินของรอบนี้", "* Billing cycle has not been generated for this month.")}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Financial numbers */}
                  <div className="text-right flex-shrink-0">
                    {item.has_bill ? (
                      item.status === "paid" || item.status === "waived" ? (
                        <div className="space-y-0.5">
                          <span className="block text-xs text-surface-400 font-medium">{t("ชำระแล้ว", "Paid")}</span>
                          <span className="block text-sm md:text-base font-black text-emerald-600">
                            {formatMoney(item.amount_paid, lang)}
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <span className="block text-xs text-surface-400 font-medium">
                            {cat.type === "overdue" ? t("ค้างชำระ", "Overdue") : t("ยอดที่ต้องชำระ", "To Pay")}
                          </span>
                          <span className={`block text-sm md:text-base font-black ${cat.type === "overdue" ? "text-red-600" : "text-amber-600"}`}>
                            {formatMoney(item.amount_due - item.amount_paid, lang)}
                          </span>
                        </div>
                      )
                    ) : (
                      <span className="text-xs text-surface-400 italic">-</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-white border border-surface-200 rounded-2xl p-12 text-center shadow-sm">
            <Clock className="w-12 h-12 text-surface-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-surface-800 mb-1">{t("ไม่มีข้อมูลประวัติการจ่ายเงิน", "No Payment History")}</h3>
            <p className="text-xs text-surface-400">{t("ไม่พบข้อมูลประวัติค่าส่วนกลางของบ้านเลขที่นี้", "No common fee payment history found for this house.")}</p>
          </div>
        )}
      </div>

      {/* Payment instructions footer */}
      <div className="bg-brand-50/50 border border-brand-100 rounded-2xl p-4 flex gap-3 text-brand-800 text-xs md:text-sm">
        <span className="text-base flex-shrink-0">ℹ️</span>
        <div>
          <p className="font-bold mb-1">{t("ต้องการชำระค่าส่วนกลาง?", "Want to pay your common fee?")}</p>
          <p className="text-brand-700 leading-relaxed">
            {t(
              "หากคุณต้องการโอนเงินเพื่อชำระค่าส่วนกลาง กรุณาติดต่อสำนักงานนิติบุคคลหรือทำตามขั้นตอนชำระเงินที่ระบุในกลุ่ม LINE เพื่อส่งหลักฐานสลิปการโอนเงิน",
              "To pay your maintenance fee, please contact the juristic office or follow the payment instructions provided in the LINE group to upload your payment transfer slip."
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
