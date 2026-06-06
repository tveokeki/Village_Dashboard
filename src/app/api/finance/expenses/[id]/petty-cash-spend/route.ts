import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { requireFinanceAccess } from "@/lib/finance-auth";
import { positiveMoney, requiredString } from "@/lib/finance-utils";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = await pool.connect();
  try {
    const user = await requireFinanceAccess();
    const { id } = await params;
    const body = await req.json();
    const amount = positiveMoney(body.amount, "amount");
    const description = requiredString(body.description, "description");

    await client.query("BEGIN");
    const requestResult = await client.query(
      `SELECT id, requested_by, request_number FROM slip_processing.expense_requests WHERE id=$1 AND deleted_at IS NULL`,
      [id]
    );
    const request = requestResult.rows[0];
    if (!request) {
      const err: any = new Error("Expense request not found");
      err.status = 404;
      throw err;
    }

    const managerId = body.manager_user_id || request.requested_by;
    const balanceResult = await client.query(
      `SELECT COALESCE(current_balance, 0) AS current_balance FROM slip_processing.v_manager_petty_cash_balance WHERE manager_user_id=$1`,
      [managerId]
    );
    const currentBalance = Number(balanceResult.rows[0]?.current_balance || 0);
    const spend = Number(amount);
    if (spend > currentBalance) {
      const err: any = new Error("Insufficient manager petty cash balance");
      err.status = 400;
      throw err;
    }
    const balanceAfter = (currentBalance - spend).toFixed(2);

    const ledger = await client.query(
      `INSERT INTO slip_processing.manager_petty_cash_ledger
        (manager_user_id, request_id, expense_item_id, transaction_type, direction, amount, balance_after, description, transaction_date, created_by, metadata)
       VALUES ($1,$2,$3,'spend_urgent','out',$4,$5,$6,COALESCE($7::date, CURRENT_DATE),$8,$9)
       RETURNING *`,
      [managerId, id, body.expense_item_id || null, amount, balanceAfter, description, body.transaction_date || null, user.id, body.metadata || {}]
    );

    await client.query(
      `INSERT INTO slip_processing.expense_approval_logs
        (request_id, actor_user_id, requester_user_id, action, old_status, new_status, notes, metadata)
       VALUES ($1,$2,$3,'updated',NULL,NULL,$4,$5)`,
      [id, user.id, request.requested_by, `Petty cash spend recorded: ${description}`, { ledger_id: ledger.rows[0].id, amount }]
    );

    await client.query("COMMIT");
    return NextResponse.json({ success: true, ledger: ledger.rows[0] }, { status: 201 });
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  } finally {
    client.release();
  }
}
