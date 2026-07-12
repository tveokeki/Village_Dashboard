import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireFinanceAccess } from "@/lib/finance-auth";

export const dynamic = "force-dynamic";

function numericYear(value: string | null) {
  const year = Number.parseInt(value || String(new Date().getFullYear()), 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return new Date().getFullYear();
  return year;
}

function numericMonth(value: string | null) {
  const month = Number.parseInt(value || String(new Date().getMonth() + 1), 10);
  if (!Number.isFinite(month) || month < 1 || month > 12) return new Date().getMonth() + 1;
  return month;
}

export async function GET(req: NextRequest) {
  try {
    await requireFinanceAccess();
    const { searchParams } = req.nextUrl;
    const type = searchParams.get("type") || "monthly";
    const year = numericYear(searchParams.get("year"));
    const month = numericMonth(searchParams.get("month"));

    if (type === "monthly") {
      const result = await query(
        `WITH period AS (
           SELECT make_date($1::int, $2::int, 1) AS start_date,
                  (make_date($1::int, $2::int, 1) + INTERVAL '1 month')::date AS end_date
         ), revenue AS (
           SELECT 'maintenance_fee' AS category, COALESCE(SUM(amount_paid), 0) AS amount
           FROM slip_processing.payments, period
           WHERE deleted_at IS NULL AND status <> 'voided' AND payment_date >= period.start_date AND payment_date < period.end_date
         ), expense AS (
           SELECT category, COALESCE(SUM(COALESCE(amount_approved, amount_requested)), 0) AS amount
           FROM slip_processing.expense_items ei
           JOIN slip_processing.expense_requests er ON er.id = ei.request_id, period
           WHERE ei.deleted_at IS NULL AND er.deleted_at IS NULL AND er.status IN ('approved', 'disbursed', 'spent', 'closed')
             AND COALESCE(er.decided_at::date, er.requested_at::date) >= period.start_date
             AND COALESCE(er.decided_at::date, er.requested_at::date) < period.end_date
           GROUP BY category
         )
         SELECT
           (SELECT COALESCE(SUM(amount),0) FROM revenue) AS total_revenue,
           (SELECT COALESCE(SUM(amount),0) FROM expense) AS total_expense,
           (SELECT COALESCE(jsonb_agg(revenue), '[]'::jsonb) FROM revenue) AS revenue_by_category,
           (SELECT COALESCE(jsonb_agg(expense), '[]'::jsonb) FROM expense) AS expense_by_category`,
        [year, month]
      );
      return NextResponse.json({ type, year, month, report: result.rows[0] });
    }

    if (type === "yearly") {
      const result = await query(
        `WITH months AS (SELECT generate_series(1,12) AS month),
         revenue AS (
           SELECT EXTRACT(MONTH FROM payment_date)::int AS month, SUM(amount_paid) AS amount
           FROM slip_processing.payments
           WHERE deleted_at IS NULL AND status <> 'voided' AND EXTRACT(YEAR FROM payment_date)::int = $1
           GROUP BY 1
         ), expense AS (
           SELECT EXTRACT(MONTH FROM COALESCE(er.decided_at, er.requested_at))::int AS month, SUM(COALESCE(ei.amount_approved, ei.amount_requested)) AS amount
           FROM slip_processing.expense_items ei
           JOIN slip_processing.expense_requests er ON er.id = ei.request_id
           WHERE ei.deleted_at IS NULL AND er.deleted_at IS NULL AND er.status IN ('approved', 'disbursed', 'spent', 'closed') AND EXTRACT(YEAR FROM COALESCE(er.decided_at, er.requested_at))::int = $1
           GROUP BY 1
         )
         SELECT m.month, COALESCE(r.amount,0) AS revenue, COALESCE(e.amount,0) AS expense, COALESCE(r.amount,0) - COALESCE(e.amount,0) AS net
         FROM months m
         LEFT JOIN revenue r ON r.month = m.month
         LEFT JOIN expense e ON e.month = m.month
         ORDER BY m.month`,
        [year]
      );
      return NextResponse.json({ type, year, months: result.rows });
    }

    if (type === "cash_flow") {
      const result = await query(
        `SELECT transaction_date, description, deposit AS cash_in, withdraw AS cash_out, remaining_balance, is_reconciled
         FROM slip_processing.bank_statements
         WHERE deleted_at IS NULL AND EXTRACT(YEAR FROM transaction_date)::int = $1
         ORDER BY transaction_date ASC`,
        [year]
      );
      const totals = result.rows.reduce((acc: any, row: any) => {
        acc.cash_in += Number(row.cash_in || 0);
        acc.cash_out += Number(row.cash_out || 0);
        return acc;
      }, { cash_in: 0, cash_out: 0 });
      return NextResponse.json({ type, year, totals: { ...totals, net_cash_flow: totals.cash_in - totals.cash_out }, rows: result.rows });
    }

    if (type === "balance_sheet") {
      const result = await query(
        `SELECT
           COALESCE((SELECT remaining_balance FROM slip_processing.bank_statements WHERE deleted_at IS NULL AND remaining_balance IS NOT NULL ORDER BY transaction_date DESC, created_at DESC LIMIT 1), 0) AS bank_cash,
           COALESCE((SELECT SUM(current_balance) FROM slip_processing.v_manager_petty_cash_balance), 0) AS petty_cash,
           COALESCE((SELECT SUM(amount_due) FROM slip_processing.v_maintenance_fee_status WHERE deleted_at IS NULL AND effective_status IN ('pending','overdue')), 0) AS accounts_receivable,
           COALESCE((SELECT SUM(total_approved) FROM slip_processing.expense_requests WHERE deleted_at IS NULL AND status='approved'), 0) AS accrued_expenses`);
      const row = result.rows[0];
      const assets = Number(row.bank_cash) + Number(row.petty_cash) + Number(row.accounts_receivable);
      const liabilities = Number(row.accrued_expenses);
      return NextResponse.json({ type, as_of: new Date().toISOString(), report: { ...row, total_assets: assets, total_liabilities: liabilities, members_equity: assets - liabilities } });
    }

    if (type === "profit_loss") {
      const result = await query(
        `SELECT
           COALESCE((SELECT SUM(amount_due) FROM slip_processing.maintenance_fees WHERE deleted_at IS NULL AND EXTRACT(YEAR FROM period_start)::int = $1 AND status <> 'cancelled'), 0) AS recognized_revenue,
           COALESCE((SELECT SUM(COALESCE(ei.amount_approved, ei.amount_requested))
                     FROM slip_processing.expense_items ei
                     JOIN slip_processing.expense_requests er ON er.id = ei.request_id
                     WHERE ei.deleted_at IS NULL AND er.deleted_at IS NULL AND er.status IN ('approved', 'disbursed', 'spent', 'closed')
                       AND EXTRACT(YEAR FROM COALESCE(er.decided_at, er.requested_at))::int = $1), 0) AS recognized_expense`,
        [year]
      );
      const row = result.rows[0];
      return NextResponse.json({ type, year, report: { ...row, net_income: Number(row.recognized_revenue) - Number(row.recognized_expense) } });
    }

    return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
