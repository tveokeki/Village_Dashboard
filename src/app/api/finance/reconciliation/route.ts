import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { requireFinanceAccess } from "@/lib/finance-auth";
import { badRequest, parseLimit, parseOffset, positiveMoney, requiredString } from "@/lib/finance-utils";

export const dynamic = "force-dynamic";

const referenceTypes = new Set(["payment", "expense_item", "expense_request", "petty_cash_ledger"]);

export async function GET(req: NextRequest) {
  try {
    await requireFinanceAccess();
    const { searchParams } = req.nextUrl;
    const unreconciledOnly = searchParams.get("unreconciled") !== "false";
    const limit = parseLimit(searchParams.get("limit"), 100, 500);
    const offset = parseOffset(searchParams.get("offset"));

    const statements = await query(
      `SELECT r.*,
              COALESCE(jsonb_agg(jsonb_build_object(
                'id', s.id,
                'reference_type', s.reference_type,
                'reference_id', s.reference_id,
                'amount', s.amount,
                'split_note', s.split_note,
                'created_by', s.created_by,
                'created_at', s.created_at
              ) ORDER BY s.created_at DESC) FILTER (WHERE s.id IS NOT NULL AND s.deleted_at IS NULL), '[]'::jsonb) AS splits
       FROM slip_processing.v_bank_statement_reconciliation r
       LEFT JOIN slip_processing.bank_statement_splits s ON s.bank_statement_line_id = r.id AND s.deleted_at IS NULL
       WHERE ($1::boolean = FALSE OR r.is_reconciled = FALSE)
       GROUP BY r.id, r.transaction_date, r.description, r.deposit, r.withdraw, r.statement_amount, r.split_amount, r.unreconciled_amount, r.is_reconciled
       ORDER BY r.transaction_date DESC
       LIMIT $2 OFFSET $3`,
      [unreconciledOnly, limit, offset]
    );

    const [paymentCandidates, expenseCandidates] = await Promise.all([
      query(
        `SELECT p.id, 'payment' AS reference_type, m.house_number, m.owner_name, p.amount_paid AS amount, p.payment_date AS date, p.receipt_number AS label
         FROM slip_processing.payments p
         JOIN slip_processing.members m ON m.id = p.member_id
         WHERE p.deleted_at IS NULL AND p.status IN ('confirmed','draft')
         ORDER BY p.payment_date DESC
         LIMIT 100`
      ),
      query(
        `SELECT ei.id, 'expense_item' AS reference_type, er.request_number, ei.description AS label, ei.category, COALESCE(ei.amount_approved, ei.amount_requested) AS amount, er.decided_at AS date
         FROM slip_processing.expense_items ei
         JOIN slip_processing.expense_requests er ON er.id = ei.request_id
         WHERE ei.deleted_at IS NULL AND er.deleted_at IS NULL AND er.status IN ('approved','paid')
         ORDER BY er.decided_at DESC NULLS LAST
         LIMIT 100`
      ),
    ]);

    return NextResponse.json({ statements: statements.rows, candidates: [...paymentCandidates.rows, ...expenseCandidates.rows], limit, offset });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const user = await requireFinanceAccess();
    const body = await req.json();
    const action = body.action || body.type;
    await client.query("BEGIN");

    if (action === "statement") {
      const result = await client.query(
        `INSERT INTO slip_processing.bank_statements
          (statement_account, transaction_date, posted_at, description, external_reference, deposit, withdraw, remaining_balance, currency, raw_data, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          body.statement_account || null,
          requiredString(body.transaction_date, "transaction_date"),
          body.posted_at || null,
          requiredString(body.description, "description"),
          body.external_reference || null,
          body.deposit ? positiveMoney(body.deposit, "deposit") : "0.00",
          body.withdraw ? positiveMoney(body.withdraw, "withdraw") : "0.00",
          body.remaining_balance ?? null,
          body.currency || "THB",
          body.raw_data || {},
          user.id,
        ]
      );
      await client.query("COMMIT");
      return NextResponse.json({ success: true, statement: result.rows[0] }, { status: 201 });
    }

    if (action === "split") {
      const splits = Array.isArray(body.splits) ? body.splits : [body];
      if (!splits.length) badRequest("At least one split is required");
      const created: any[] = [];
      for (const split of splits) {
        const referenceType = requiredString(split.reference_type, "reference_type");
        if (!referenceTypes.has(referenceType)) badRequest("Invalid reference_type");
        const result = await client.query(
          `INSERT INTO slip_processing.bank_statement_splits
            (bank_statement_line_id, reference_type, reference_id, amount, split_note, created_by)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING *`,
          [
            requiredString(split.bank_statement_line_id || body.bank_statement_line_id, "bank_statement_line_id"),
            referenceType,
            requiredString(split.reference_id, "reference_id"),
            positiveMoney(split.amount, "split.amount"),
            split.split_note || body.split_note || null,
            user.id,
          ]
        );
        created.push(result.rows[0]);
      }
      await client.query("COMMIT");
      return NextResponse.json({ success: true, splits: created }, { status: 201 });
    }

    badRequest("Invalid reconciliation action");
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  } finally {
    client.release();
  }
}
