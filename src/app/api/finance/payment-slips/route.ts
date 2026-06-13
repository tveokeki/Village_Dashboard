import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireFinanceAccess } from "@/lib/finance-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireFinanceAccess();
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "all";

    let sql = `
      SELECT id, payer_name_raw, payee_name_raw, amount, currency_code,
             transaction_at, bank_ref_id, promptpay_ref_id, processing_status,
             file_system_path, created_at
      FROM slip_processing.payment_slips
      WHERE deleted_at IS NULL
    `;
    const params: any[] = [];

    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (payer_name_raw ILIKE $${params.length} OR payee_name_raw ILIKE $${params.length} OR bank_ref_id ILIKE $${params.length} OR promptpay_ref_id ILIKE $${params.length})`;
    }

    if (status !== "all") {
      params.push(status);
      sql += ` AND processing_status = $${params.length}`;
    }

    sql += " ORDER BY created_at DESC LIMIT 100";

    const { rows } = await query(sql, params);
    return NextResponse.json({ payment_slips: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireFinanceAccess();
    const body = await req.json();
    const {
      id,
      payer_name_raw,
      payee_name_raw,
      amount,
      transaction_at,
      bank_ref_id,
      promptpay_ref_id,
      processing_status,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // 1. Fetch current data (before_data)
    const beforeResult = await query(
      "SELECT * FROM slip_processing.payment_slips WHERE id = $1 AND deleted_at IS NULL",
      [id]
    );
    if (beforeResult.rows.length === 0) {
      return NextResponse.json({ error: "Payment slip not found" }, { status: 404 });
    }
    const beforeData = beforeResult.rows[0];

    // 2. Perform update
    const updateResult = await query(
      `UPDATE slip_processing.payment_slips
       SET payer_name_raw = COALESCE($1, payer_name_raw),
           payee_name_raw = COALESCE($2, payee_name_raw),
           amount = COALESCE($3, amount),
           transaction_at = COALESCE($4, transaction_at),
           bank_ref_id = $5,
           promptpay_ref_id = $6,
           processing_status = COALESCE($7, processing_status),
           updated_at = NOW()
       WHERE id = $8 AND deleted_at IS NULL
       RETURNING *`,
      [
        payer_name_raw,
        payee_name_raw,
        amount,
        transaction_at,
        bank_ref_id,
        promptpay_ref_id,
        processing_status,
        id,
      ]
    );

    const afterData = updateResult.rows[0];

    // 3. Insert audit log
    await query(
      `INSERT INTO slip_processing.slip_audit_log (payment_slip_id, operation, actor_user_id, actor_context, before_data, after_data)
       VALUES ($1, 'UPDATE', $2, $3, $4, $5)`,
      [
        id,
        user.id,
        JSON.stringify({ email: user.email, name: user.name, role: user.role }),
        JSON.stringify(beforeData),
        JSON.stringify(afterData),
      ]
    );

    return NextResponse.json({ success: true, payment_slip: afterData });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireFinanceAccess();
    const { searchParams } = req.nextUrl;
    const id = searchParams.get("id")?.trim() || "";

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // 1. Fetch current data (before_data)
    const beforeResult = await query(
      "SELECT * FROM slip_processing.payment_slips WHERE id = $1 AND deleted_at IS NULL",
      [id]
    );
    if (beforeResult.rows.length === 0) {
      return NextResponse.json({ error: "Payment slip not found" }, { status: 404 });
    }
    const beforeData = beforeResult.rows[0];

    // Get the core user_id for deleted_by
    const userRes = await query("SELECT user_id FROM slip_processing.web_users WHERE id = $1", [user.id]);
    const coreUserId = userRes.rows[0]?.user_id || null;

    // 2. Perform soft-delete
    const deleteResult = await query(
      `UPDATE slip_processing.payment_slips
       SET deleted_at = NOW(),
           deleted_by = $1,
           updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [coreUserId, id]
    );

    const afterData = deleteResult.rows[0];

    // 3. Insert audit log
    await query(
      `INSERT INTO slip_processing.slip_audit_log (payment_slip_id, operation, actor_user_id, actor_context, before_data, after_data)
       VALUES ($1, 'DELETE', $2, $3, $4, $5)`,
      [
        id,
        user.id,
        JSON.stringify({ email: user.email, name: user.name, role: user.role }),
        JSON.stringify(beforeData),
        JSON.stringify(afterData),
      ]
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
