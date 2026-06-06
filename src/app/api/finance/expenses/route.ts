import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { requireExpenseRequesterRole, requireFinanceAccess } from "@/lib/finance-auth";
import { parseLimit, parseOffset, positiveMoney, requiredString } from "@/lib/finance-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireFinanceAccess();
    const { searchParams } = req.nextUrl;
    const status = searchParams.get("status")?.trim();
    const q = searchParams.get("q")?.trim();
    const limit = parseLimit(searchParams.get("limit"), 100, 500);
    const offset = parseOffset(searchParams.get("offset"));

    const params: any[] = [];
    let where = "WHERE er.deleted_at IS NULL";
    if (status && status !== "all") {
      params.push(status);
      where += ` AND er.status = $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (er.request_number ILIKE $${params.length} OR er.title ILIKE $${params.length} OR er.description ILIKE $${params.length})`;
    }

    const requests = await query(
      `SELECT er.*,
              requester.display_name AS requester_name,
              requester.email AS requester_email,
              approver.display_name AS approver_name,
              approver.email AS approver_email,
              COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                'id', ei.id,
                'description', ei.description,
                'category', ei.category,
                'amount_requested', ei.amount_requested,
                'amount_approved', ei.amount_approved,
                'payment_source', ei.payment_source,
                'status', ei.status,
                'spent_at', ei.spent_at
              )) FILTER (WHERE ei.id IS NOT NULL), '[]'::jsonb) AS items,
              COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                'id', eal.id,
                'actor_user_id', eal.actor_user_id,
                'action', eal.action,
                'old_status', eal.old_status,
                'new_status', eal.new_status,
                'old_total_approved', eal.old_total_approved,
                'new_total_approved', eal.new_total_approved,
                'notes', eal.notes,
                'created_at', eal.created_at
              )) FILTER (WHERE eal.id IS NOT NULL), '[]'::jsonb) AS approval_logs
       FROM slip_processing.expense_requests er
       LEFT JOIN slip_processing.web_users requester ON requester.id = er.requested_by
       LEFT JOIN slip_processing.web_users approver ON approver.id = er.approved_by
       LEFT JOIN slip_processing.expense_items ei ON ei.request_id = er.id AND ei.deleted_at IS NULL
       LEFT JOIN slip_processing.expense_approval_logs eal ON eal.request_id = er.id
       ${where}
       GROUP BY er.id, requester.display_name, requester.email, approver.display_name, approver.email
       ORDER BY er.requested_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const [stats, balances, ledger] = await Promise.all([
      query(`SELECT status, COUNT(*)::int AS count, COALESCE(SUM(total_requested), 0) AS total_requested, COALESCE(SUM(total_approved), 0) AS total_approved FROM slip_processing.expense_requests WHERE deleted_at IS NULL GROUP BY status`),
      query(`SELECT b.manager_user_id, COALESCE(wu.display_name, wu.email) AS manager_name, b.current_balance, b.last_transaction_at FROM slip_processing.v_manager_petty_cash_balance b LEFT JOIN slip_processing.web_users wu ON wu.id = b.manager_user_id ORDER BY manager_name`),
      query(`SELECT l.*, COALESCE(wu.display_name, wu.email) AS manager_name FROM slip_processing.manager_petty_cash_ledger l LEFT JOIN slip_processing.web_users wu ON wu.id = l.manager_user_id WHERE l.deleted_at IS NULL ORDER BY l.transaction_date DESC, l.created_at DESC LIMIT 100`),
    ]);

    return NextResponse.json({ requests: requests.rows, stats: stats.rows, petty_cash_balances: balances.rows, petty_cash_ledger: ledger.rows, limit, offset });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const user = await requireExpenseRequesterRole();
    const body = await req.json();
    const title = requiredString(body.title, "title");
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      const err: any = new Error("At least one expense item is required");
      err.status = 400;
      throw err;
    }

    const normalizedItems = items.map((item: any) => ({
      description: requiredString(item.description, "item.description"),
      category: requiredString(item.category, "item.category"),
      amount: positiveMoney(item.amount ?? item.amount_requested, "item.amount"),
      payment_source: item.payment_source || "bank_transfer",
      spent_at: item.spent_at || null,
      receipt_file_path: item.receipt_file_path || null,
      metadata: item.metadata || {},
    }));
    const totalRequested = normalizedItems.reduce((sum: number, item: any) => sum + Number(item.amount), 0).toFixed(2);

    await client.query("BEGIN");
    const requestResult = await client.query(
      `INSERT INTO slip_processing.expense_requests (title, description, requested_by, total_requested, status, metadata)
       VALUES ($1,$2,$3,$4,'pending',$5)
       RETURNING *`,
      [title, body.description || null, user.id, totalRequested, body.metadata || {}]
    );
    const request = requestResult.rows[0];

    for (const item of normalizedItems) {
      await client.query(
        `INSERT INTO slip_processing.expense_items (request_id, description, category, amount_requested, payment_source, spent_at, receipt_file_path, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [request.id, item.description, item.category, item.amount, item.payment_source, item.spent_at, item.receipt_file_path, item.metadata]
      );
    }

    await client.query(
      `INSERT INTO slip_processing.expense_approval_logs
        (request_id, actor_user_id, requester_user_id, action, old_status, new_status, notes, metadata)
       VALUES ($1,$2,$3,'created',NULL,'pending',$4,$5)`,
      [request.id, user.id, user.id, body.notes || "Expense request created", { item_count: normalizedItems.length }]
    );

    await client.query("COMMIT");
    return NextResponse.json({ success: true, request }, { status: 201 });
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  } finally {
    client.release();
  }
}
