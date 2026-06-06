import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { assertNotSelfApproval, requireFinanceAccess } from "@/lib/finance-auth";
import { money, positiveMoney, requiredString } from "@/lib/finance-utils";

export const dynamic = "force-dynamic";

const allowedActions = new Set(["approved", "rejected", "paid", "cancelled"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = await pool.connect();
  try {
    const user = await requireFinanceAccess();
    const { id } = await params;
    const body = await req.json();
    const action = requiredString(body.action || body.status, "action");
    if (!allowedActions.has(action)) {
      const err: any = new Error("Invalid approval action");
      err.status = 400;
      throw err;
    }

    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT * FROM slip_processing.expense_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    const current = currentResult.rows[0];
    if (!current) {
      const err: any = new Error("Expense request not found");
      err.status = 404;
      throw err;
    }

    if (["approved", "rejected"].includes(action)) {
      assertNotSelfApproval(current.requested_by, user.id);
    }

    const oldStatus = current.status;
    const oldTotalApproved = current.total_approved;
    let newTotalApproved: string | null = current.total_approved;
    let approvedBy = current.approved_by;
    let decidedAt = current.decided_at;

    if (action === "approved") {
      newTotalApproved = money(body.total_approved ?? current.total_requested, "total_approved");
      approvedBy = user.id;
      decidedAt = new Date();
      const itemRows = await client.query(
        `SELECT id, amount_requested FROM slip_processing.expense_items WHERE request_id=$1 AND deleted_at IS NULL`,
        [id]
      );
      const itemApprovals = new Map<string, string>();
      for (const item of Array.isArray(body.items) ? body.items : []) {
        itemApprovals.set(String(item.id), money(item.amount_approved ?? item.amount_requested, "item.amount_approved"));
      }
      for (const row of itemRows.rows) {
        await client.query(
          `UPDATE slip_processing.expense_items SET amount_approved=$2, status='approved', updated_at=NOW() WHERE id=$1`,
          [row.id, itemApprovals.get(String(row.id)) || row.amount_requested]
        );
      }
    } else if (action === "rejected") {
      newTotalApproved = "0.00";
      approvedBy = user.id;
      decidedAt = new Date();
      await client.query(`UPDATE slip_processing.expense_items SET amount_approved=0, status='rejected', updated_at=NOW() WHERE request_id=$1 AND deleted_at IS NULL`, [id]);
    } else if (action === "paid") {
      if (current.status !== "approved") {
        const err: any = new Error("Only approved requests can be marked as paid");
        err.status = 400;
        throw err;
      }
      await client.query(`UPDATE slip_processing.expense_items SET status='paid', updated_at=NOW() WHERE request_id=$1 AND deleted_at IS NULL AND status='approved'`, [id]);
    }

    const updateResult = await client.query(
      `UPDATE slip_processing.expense_requests
       SET status=$2,
           approved_by=$3,
           total_approved=$4,
           decided_at=$5,
           approval_notes=$6,
           updated_at=NOW()
       WHERE id=$1 AND deleted_at IS NULL
       RETURNING *`,
      [id, action, approvedBy, newTotalApproved, decidedAt, body.notes || current.approval_notes || null]
    );
    const updated = updateResult.rows[0];

    await client.query(
      `INSERT INTO slip_processing.expense_approval_logs
        (request_id, actor_user_id, requester_user_id, approver_user_id, action, old_status, new_status, old_total_approved, new_total_approved, notes, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, user.id, current.requested_by, approvedBy, action, oldStatus, action, oldTotalApproved, newTotalApproved, body.notes || null, body.metadata || {}]
    );

    if (action === "approved") {
      const surplus = Number(newTotalApproved || 0) - Number(current.total_requested || 0);
      if (surplus > 0) {
        const balance = await client.query(
          `SELECT COALESCE(current_balance, 0) AS current_balance FROM slip_processing.v_manager_petty_cash_balance WHERE manager_user_id=$1`,
          [current.requested_by]
        );
        const currentBalance = Number(balance.rows[0]?.current_balance || 0);
        const balanceAfter = (currentBalance + surplus).toFixed(2);
        await client.query(
          `INSERT INTO slip_processing.manager_petty_cash_ledger
            (manager_user_id, request_id, transaction_type, direction, amount, balance_after, description, created_by, metadata)
           VALUES ($1,$2,'receive_surplus','in',$3,$4,$5,$6,$7)`,
          [current.requested_by, id, surplus.toFixed(2), balanceAfter, `Surplus from approved expense request ${updated.request_number}`, user.id, { total_requested: current.total_requested, total_approved: newTotalApproved }]
        );
      }
    }

    await client.query("COMMIT");
    return NextResponse.json({ success: true, request: updated });
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  } finally {
    client.release();
  }
}
