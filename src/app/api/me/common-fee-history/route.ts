import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatMonthStr(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function getMonthsInRange(startStr: string, endStr: string) {
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  const months: string[] = [];

  let current = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);

  // Guard against infinite loop
  let limit = 0;
  while (current <= last && limit < 240) {
    months.push(formatMonthStr(current));
    current.setMonth(current.getMonth() + 1);
    limit++;
  }
  return months;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Get the current user's profile from web_users
    const resultUser = await query(
      `SELECT id, house_number, display_name, email
       FROM slip_processing.web_users
       WHERE id = $1 AND deleted_at IS NULL`,
      [user.id]
    );

    const dbUser = resultUser.rows[0];
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const houseNumber = dbUser.house_number?.trim();
    if (!houseNumber) {
      return NextResponse.json({
        success: true,
        hasHouseNumber: false,
        hasMember: false,
        history: [],
      });
    }

    // 2. Look up the member row in slip_processing.members
    const memberRes = await query(
      `SELECT id, house_number, owner_name
       FROM slip_processing.members
       WHERE (web_user_id = $1 OR (house_number = $2 AND house_number IS NOT NULL AND house_number <> '')) AND deleted_at IS NULL
       ORDER BY CASE WHEN web_user_id = $1 THEN 1 ELSE 2 END
       LIMIT 1`,
      [dbUser.id, houseNumber]
    );

    if (memberRes.rows.length === 0) {
      return NextResponse.json({
        success: true,
        hasHouseNumber: true,
        hasMember: false,
        houseNumber: houseNumber,
        history: [],
      });
    }

    const member = memberRes.rows[0];

    // 3. Fetch maintenance fee records (monthly) for this member, summing payments
    const feesRes = await query(
      `SELECT
         mf.id,
         mf.period_start::text,
         mf.period_end::text,
         mf.due_date::text,
         mf.amount_due,
         COALESCE(SUM(p.amount_paid) FILTER (WHERE p.deleted_at IS NULL AND p.status <> 'voided'), 0) AS amount_paid,
         mf.status,
         mf.paid_at,
         mf.notes
       FROM slip_processing.maintenance_fees mf
       LEFT JOIN slip_processing.payments p ON p.maintenance_fee_id = mf.id
       WHERE mf.member_id = $1
         AND mf.payment_frequency = 'monthly'
         AND mf.deleted_at IS NULL
         AND mf.status <> 'cancelled'
       GROUP BY mf.id
       ORDER BY mf.period_start ASC`,
      [member.id]
    );

    const fees = feesRes.rows;

    // 4. Calculate Date Ranges
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-indexed
    const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;

    // Oldest unpaid fee before or in the current month (status NOT IN ('paid', 'waived'))
    const oldestUnpaid = fees.find((f: any) =>
      f.status !== "paid" &&
      f.status !== "waived" &&
      new Date(f.period_start + "T00:00:00") <= new Date(currentMonthStr + "T00:00:00")
    );

    let startMonthStr = "";
    if (oldestUnpaid) {
      // Show starting from the oldest unpaid month
      const d = new Date(oldestUnpaid.period_start + "T00:00:00");
      startMonthStr = formatMonthStr(d);
    } else {
      // No unpaid fees: show from January of current year
      startMonthStr = `${currentYear}-01-01`;
    }

    // Find furthest paid/waived month in the future (advance payment)
    let maxPaidMonthStr = "";
    fees.forEach((f: any) => {
      if (f.status === "paid" || f.status === "waived") {
        const d = new Date(f.period_start + "T00:00:00");
        const currentFirstDay = new Date(currentYear, currentMonth, 1);
        if (d > currentFirstDay) {
          const pStr = formatMonthStr(d);
          if (!maxPaidMonthStr || pStr > maxPaidMonthStr) {
            maxPaidMonthStr = pStr;
          }
        }
      }
    });

    let endMonthStr = currentMonthStr;
    if (maxPaidMonthStr && maxPaidMonthStr > currentMonthStr) {
      endMonthStr = maxPaidMonthStr;
    }

    // Force startMonthStr to be before or equal to endMonthStr
    if (startMonthStr > endMonthStr) {
      startMonthStr = endMonthStr;
    }

    // 5. Generate consecutive months
    const targetMonths = getMonthsInRange(startMonthStr, endMonthStr);

    // Map each target month to its db record (or default to 'none' if missing)
    const history = targetMonths.map((mStr) => {
      const match = fees.find((f: any) => {
        const d = new Date(f.period_start + "T00:00:00");
        return formatMonthStr(d) === mStr;
      });

      if (match) {
        return {
          month: mStr,
          has_bill: true,
          id: match.id,
          period_start: match.period_start,
          period_end: match.period_end,
          due_date: match.due_date,
          amount_due: Number(match.amount_due),
          amount_paid: Number(match.amount_paid),
          status: match.status,
          paid_at: match.paid_at,
          notes: match.notes,
        };
      } else {
        // Compute end of month for placeholder
        const d = new Date(mStr + "T00:00:00");
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const y = lastDay.getFullYear();
        const m = String(lastDay.getMonth() + 1).padStart(2, "0");
        const dDay = String(lastDay.getDate()).padStart(2, "0");
        const periodEndStr = `${y}-${m}-${dDay}`;

        // Standard due date is the 10th of the month
        const dueStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-10`;

        return {
          month: mStr,
          has_bill: false,
          period_start: mStr,
          period_end: periodEndStr,
          due_date: dueStr,
          amount_due: 0,
          amount_paid: 0,
          status: "none",
          paid_at: null,
          notes: null,
        };
      }
    });

    return NextResponse.json({
      success: true,
      hasHouseNumber: true,
      hasMember: true,
      houseNumber: member.house_number,
      memberName: member.owner_name,
      history: history.reverse(), // Show newest first for better readability
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load common fee history" }, { status: 500 });
  }
}
