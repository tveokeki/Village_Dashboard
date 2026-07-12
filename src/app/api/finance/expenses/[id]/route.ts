import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { requireExpenseRequesterRole } from "@/lib/finance-auth";
import { positiveMoney, requiredString } from "@/lib/finance-utils";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = await pool.connect();
  try {
    const user = await requireExpenseRequesterRole();
    const { id } = await params;
    const body = await req.json();

    // 1. Fetch current data
    const res = await client.query(
      "SELECT * FROM slip_processing.expense_requests WHERE id = $1 AND deleted_at IS NULL",
      [id]
    );
    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Expense request not found" }, { status: 404 });
    }
    const exp = res.rows[0];

    // Restrict editing to pending/draft status
    if (exp.status !== "pending" && exp.status !== "draft") {
      return NextResponse.json({ error: "Only pending or draft requests can be edited" }, { status: 400 });
    }

    const title = requiredString(body.title, "title");
    const description = body.description || null;
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return NextResponse.json({ error: "At least one expense item is required" }, { status: 400 });
    }

    const normalizedItems = items.map((item: any) => ({
      id: item.id || null,
      description: requiredString(item.description, "item.description"),
      category: requiredString(item.category, "item.category"),
      subcategory: item.subcategory || null,
      notes: item.notes || null,
      amount: positiveMoney(item.amount ?? item.amount_requested, "item.amount"),
      payment_source: item.payment_source || "bank_transfer",
      spent_at: item.spent_at || null,
      receipt_file_path: item.receipt_file_path || null,
      metadata: item.metadata || {},
    }));
    const totalRequested = normalizedItems.reduce((sum: number, item: any) => sum + Number(item.amount), 0).toFixed(2);

    await client.query("BEGIN");

    // Update expense request
    await client.query(
      `UPDATE slip_processing.expense_requests
       SET title = $1, description = $2, total_requested = $3, updated_at = NOW()
       WHERE id = $4`,
      [title, description, totalRequested, id]
    );

    // Keep track of existing active item IDs that we are updating
    const activeItemIds = normalizedItems.map((it: any) => it.id).filter(Boolean);

    // Soft-delete items that were removed in the edit
    if (activeItemIds.length > 0) {
      await client.query(
        `UPDATE slip_processing.expense_items
         SET deleted_at = NOW()
         WHERE request_id = $1 AND id NOT IN (SELECT unnest($2::uuid[])) AND deleted_at IS NULL`,
        [id, activeItemIds]
      );
    } else {
      await client.query(
        `UPDATE slip_processing.expense_items
         SET deleted_at = NOW()
         WHERE request_id = $1 AND deleted_at IS NULL`,
        [id]
      );
    }

    // Upsert items
    for (const item of normalizedItems) {
      if (item.id) {
        // Update existing item
        await client.query(
          `UPDATE slip_processing.expense_items
           SET description = $1, category = $2, subcategory = $3, notes = $4, amount_requested = $5, payment_source = $6, spent_at = $7, receipt_file_path = $8, metadata = $9, updated_at = NOW()
           WHERE id = $10 AND request_id = $11`,
          [item.description, item.category, item.subcategory, item.notes, item.amount, item.payment_source, item.spent_at, item.receipt_file_path, item.metadata, item.id, id]
        );
      } else {
        // Insert new item
        await client.query(
          `INSERT INTO slip_processing.expense_items (request_id, description, category, subcategory, notes, amount_requested, payment_source, spent_at, receipt_file_path, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [id, item.description, item.category, item.subcategory, item.notes, item.amount, item.payment_source, item.spent_at, item.receipt_file_path, item.metadata]
        );
      }
    }

    // Log the edit
    await client.query(
      `INSERT INTO slip_processing.expense_approval_logs
        (request_id, actor_user_id, requester_user_id, action, old_status, new_status, notes, metadata)
       VALUES ($1,$2,$3,'edited',$4,$4,$5,$6)`,
      [id, user.id, exp.requested_by, exp.status, body.notes || "Expense request edited", { item_count: normalizedItems.length, previous_total: exp.total_requested, new_total: totalRequested }]
    );

    await client.query("COMMIT");
    return NextResponse.json({ success: true });
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireExpenseRequesterRole();
    const { id } = await params;

    // 1. Check if expense exists and is pending or draft
    const res = await query(
      "SELECT * FROM slip_processing.expense_requests WHERE id = $1 AND deleted_at IS NULL",
      [id]
    );
    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Expense request not found" }, { status: 404 });
    }
    const exp = res.rows[0];

    // Restrict deleting to pending/draft status
    if (exp.status !== "pending" && exp.status !== "draft") {
      return NextResponse.json({ error: "Only pending or draft requests can be deleted" }, { status: 400 });
    }

    // Get the core user_id for deleted_by
    const userRes = await query("SELECT user_id FROM slip_processing.web_users WHERE id = $1", [user.id]);
    const coreUserId = userRes.rows[0]?.user_id || null;

    // Perform soft-delete
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        "UPDATE slip_processing.expense_requests SET deleted_at = NOW(), deleted_by = $1, status = 'cancelled' WHERE id = $2",
        [coreUserId, id]
      );

      await client.query(
        "UPDATE slip_processing.expense_items SET deleted_at = NOW(), deleted_by = $1, status = 'cancelled' WHERE request_id = $2 AND deleted_at IS NULL",
        [coreUserId, id]
      );

      // Log the deletion
      await client.query(
        `INSERT INTO slip_processing.expense_approval_logs
          (request_id, actor_user_id, requester_user_id, action, old_status, new_status, notes)
         VALUES ($1, $2, $3, 'deleted', $4, 'cancelled', 'Request deleted')`,
        [id, user.id, exp.requested_by, exp.status]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
