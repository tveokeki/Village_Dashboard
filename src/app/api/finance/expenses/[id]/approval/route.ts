import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { assertNotSelfApproval, requireAnyRole, requireFinanceAccess, requirePresidentOrVicePresidentRole } from "@/lib/finance-auth";
import { money, positiveMoney, requiredString } from "@/lib/finance-utils";

export const dynamic = "force-dynamic";

const allowedActions = new Set(["approved", "rejected", "disbursed", "spent", "closed", "cancelled"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = await pool.connect();
  try {
    const user = await requireFinanceAccess();
    const { id } = await params;
    const body = await req.json();
    const action = requiredString(body.action || body.status, "action");
    if (!allowedActions.has(action)) {
      const err: any = new Error("Invalid workflow action");
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

    const oldStatus = current.status;
    const oldTotalApproved = current.total_approved;
    let newTotalApproved: string | null = current.total_approved;
    let approvedBy = current.approved_by;
    let decidedAt = current.decided_at;

    if (action === "approved" || action === "rejected") {
      // 1. Authorization: Only President, Vice President, or Admin can approve/reject
      await requirePresidentOrVicePresidentRole();
      assertNotSelfApproval(current.requested_by, user.id);

      if (current.status !== "pending") {
        throw new Error("Only pending requests can be approved or rejected");
      }

      if (action === "approved") {
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
        
        let calculatedTotalApproved = 0;
        for (const row of itemRows.rows) {
          const approvedAmountStr = itemApprovals.get(String(row.id)) ?? row.amount_requested;
          const approvedAmount = Number(approvedAmountStr);
          const itemStatus = approvedAmount > 0 ? "approved" : "rejected";
          
          if (itemStatus === "approved") {
            calculatedTotalApproved += approvedAmount;
          }

          await client.query(
            `UPDATE slip_processing.expense_items 
             SET amount_approved=$2, 
                 status=$3, 
                 updated_at=NOW() 
             WHERE id=$1`,
            [row.id, approvedAmountStr, itemStatus]
          );
        }
        newTotalApproved = calculatedTotalApproved.toFixed(2);
      } else {
        newTotalApproved = "0.00";
        approvedBy = user.id;
        decidedAt = new Date();
        await client.query(`UPDATE slip_processing.expense_items SET amount_approved=0, status='rejected', updated_at=NOW() WHERE request_id=$1 AND deleted_at IS NULL`, [id]);
      }

      await client.query(
        `UPDATE slip_processing.expense_requests
         SET status=$2,
             approved_by=$3,
             total_approved=$4,
             decided_at=$5,
             approval_notes=$6,
             updated_at=NOW()
         WHERE id=$1`,
        [id, action, approvedBy, newTotalApproved, decidedAt, body.notes || current.approval_notes || null]
      );
    } 
    else if (action === "disbursed") {
      // 2. Authorization: Only Accountant or Admin can disburse
      await requireAnyRole(["accountant", "admin"]);

      if (current.status !== "approved") {
        throw new Error("Only approved requests can be disbursed");
      }

      const disbursedAmount = money(body.disbursed_amount ?? current.total_approved ?? current.total_requested, "disbursed_amount");
      const disbursalChannel = requiredString(body.disbursal_channel || "bank_transfer", "disbursal_channel");
      const disbursalReceiptPath = body.disbursal_receipt_path || null;

      await client.query(
        `UPDATE slip_processing.expense_requests
         SET status='disbursed',
             disbursed_by=$2,
             disbursed_at=NOW(),
             disbursed_amount=$3,
             disbursal_channel=$4,
             disbursal_receipt_path=$5,
             updated_at=NOW()
         WHERE id=$1`,
        [id, user.id, disbursedAmount, disbursalChannel, disbursalReceiptPath]
      );

      // Only disburse approved items
      await client.query(
        `UPDATE slip_processing.expense_items 
         SET status='disbursed', updated_at=NOW() 
         WHERE request_id=$1 AND status='approved' AND deleted_at IS NULL`, 
        [id]
      );
    }
    else if (action === "spent") {
      // 3. Authorization: Only Manager (the requester) or Admin can confirm spending
      await requireAnyRole(["manager", "admin"]);

      if (current.status !== "disbursed") {
        throw new Error("Only disbursed requests can be marked as spent");
      }

      // Update actual spends on items
      const spentItems = Array.isArray(body.items) ? body.items : [];
      let totalSpent = 0;

      for (const item of spentItems) {
        const actualSpent = money(item.amount_approved ?? item.amount_requested, "item.amount_approved");
        totalSpent += Number(actualSpent);
        await client.query(
          `UPDATE slip_processing.expense_items 
           SET amount_approved=$2, 
               status='spent', 
               spent_at=COALESCE($3::date, CURRENT_DATE), 
               receipt_file_path=$4,
               updated_at=NOW() 
           WHERE id=$1 AND request_id=$5 AND status='disbursed'`,
          [item.id, actualSpent, item.spent_at || null, item.receipt_file_path || null, id]
        );
      }

      // Record spent status on other items that were disbursed but not passed in body
      await client.query(
        `UPDATE slip_processing.expense_items 
         SET status='spent', updated_at=NOW() 
         WHERE request_id=$1 AND status='disbursed' AND deleted_at IS NULL`,
        [id]
      );

      // Handle Leftover Petty Cash automatically
      const disbursedTotal = Number(current.disbursed_amount || current.total_approved || 0);
      const surplus = disbursedTotal - totalSpent;

      if (surplus > 0) {
        const balanceResult = await client.query(
          `SELECT COALESCE(current_balance, 0) AS current_balance FROM slip_processing.v_manager_petty_cash_balance WHERE manager_user_id=$1`,
          [current.requested_by]
        );
        const currentBalance = Number(balanceResult.rows[0]?.current_balance || 0);
        const balanceAfter = (currentBalance + surplus).toFixed(2);

        await client.query(
          `INSERT INTO slip_processing.manager_petty_cash_ledger
            (manager_user_id, request_id, transaction_type, direction, amount, balance_after, description, created_by, metadata)
           VALUES ($1,$2,'receive_surplus','in',$3,$4,$5,$6,$7)`,
          [
            current.requested_by, 
            id, 
            surplus.toFixed(2), 
            balanceAfter, 
            `Auto surplus leftover from spent report of EXP request ${current.request_number}`, 
            user.id, 
            { total_disbursed: disbursedTotal, total_spent: totalSpent, surplus }
          ]
        );
      }

      await client.query(
        `UPDATE slip_processing.expense_requests
         SET status='spent',
             spent_confirmed_by=$2,
             spent_confirmed_at=NOW(),
             updated_at=NOW()
         WHERE id=$1`,
        [id, user.id]
      );
    }
    else if (action === "closed") {
      // 4. Authorization: Only Accountant or Admin can close/audit
      await requireAnyRole(["accountant", "admin"]);

      if (current.status !== "spent") {
        throw new Error("Only spent requests can be verified and closed");
      }

      await client.query(
        `UPDATE slip_processing.expense_requests
         SET status='closed',
             verified_by=$2,
             verified_at=NOW(),
             updated_at=NOW()
         WHERE id=$1`,
        [id, user.id]
      );

      await client.query(
        `UPDATE slip_processing.expense_items 
         SET status='closed', updated_at=NOW() 
         WHERE request_id=$1 AND status='spent' AND deleted_at IS NULL`, 
        [id]
      );
    }
    else if (action === "cancelled") {
      if (!["draft", "pending", "approved"].includes(current.status)) {
        throw new Error("Cannot cancel request at this stage");
      }

      await client.query(
        `UPDATE slip_processing.expense_requests
         SET status='cancelled', updated_at=NOW()
         WHERE id=$1`,
        [id]
      );

      await client.query(
        `UPDATE slip_processing.expense_items 
         SET status='cancelled', updated_at=NOW() 
         WHERE request_id=$1 AND deleted_at IS NULL`, 
        [id]
      );
    }

    // Insert approval log for audit
    await client.query(
      `INSERT INTO slip_processing.expense_approval_logs
        (request_id, actor_user_id, requester_user_id, approver_user_id, action, old_status, new_status, old_total_approved, new_total_approved, notes, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id, 
        user.id, 
        current.requested_by, 
        approvedBy || null, 
        action, 
        oldStatus, 
        action, 
        oldTotalApproved, 
        newTotalApproved, 
        body.notes || null, 
        body.metadata || {}
      ]
    );

    await client.query("COMMIT");
    
    // Trigger LINE notifications on status updates
    try {
      const { notifyLineExpenseUpdate } = await import("@/lib/line-ticket-notifications");
      await notifyLineExpenseUpdate(id, action, user.id);
    } catch (notifErr) {
      console.error("Failed to deliver expense LINE notification:", notifErr);
    }

    const updatedResult = await client.query(`SELECT * FROM slip_processing.expense_requests WHERE id=$1`, [id]);
    return NextResponse.json({ success: true, request: updatedResult.rows[0] });
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  } finally {
    client.release();
  }
}
