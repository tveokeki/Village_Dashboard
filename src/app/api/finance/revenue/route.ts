import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { requireFinanceAccess } from "@/lib/finance-auth";
import { badRequest, money, optionalDate, parseLimit, parseOffset, positiveMoney, requiredString } from "@/lib/finance-utils";

export const dynamic = "force-dynamic";

const paymentTypes = new Set(["monthly", "village_fund_2569", "retroactive_common_fee", "deposit_interest", "construction_deposit", "fine", "other"]);
const feeStatuses = new Set(["pending", "paid", "overdue", "waived", "cancelled"]);

export async function GET(req: NextRequest) {
  try {
    await requireFinanceAccess();
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q")?.trim();
    const houseNumber = searchParams.get("house_number")?.trim();
    const status = searchParams.get("status")?.trim();
    const paymentType = searchParams.get("payment_type")?.trim();
    const from = searchParams.get("from")?.trim();
    const to = searchParams.get("to")?.trim();
    const limit = parseLimit(searchParams.get("limit"), 100, 500);
    const offset = parseOffset(searchParams.get("offset"));
    const tab = searchParams.get("tab") || "common";

    const params: any[] = [];
    let where = "WHERE mf.deleted_at IS NULL AND m.deleted_at IS NULL";
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (m.house_number ILIKE $${params.length} OR m.owner_name ILIKE $${params.length})`;
    }
    if (houseNumber) {
      params.push(`%${houseNumber}%`);
      where += ` AND m.house_number ILIKE $${params.length}`;
    }
    if (status && status !== "all") {
      params.push(status);
      where += ` AND fs.effective_status = $${params.length}`;
    }
    if (paymentType && paymentType !== "all") {
      params.push(paymentType);
      where += ` AND mf.payment_frequency = $${params.length}`;
    }
    if (from) {
      params.push(from);
      where += ` AND mf.period_start >= $${params.length}::date`;
    }
    if (to) {
      params.push(to);
      where += ` AND mf.period_end <= $${params.length}::date`;
    }

    const rowsSql = `
      SELECT
        mf.id, mf.member_id, m.house_number, m.owner_name, m.land_type, m.contact_info,
        mf.period_start, mf.period_end, mf.due_date, mf.amount_due,
        mf.payment_frequency, mf.status, fs.effective_status, mf.paid_at,
        COALESCE(SUM(p.amount_paid) FILTER (WHERE p.deleted_at IS NULL AND p.status <> 'voided'), 0) AS amount_paid,
        MAX(p.payment_date) FILTER (WHERE p.deleted_at IS NULL AND p.status <> 'voided') AS last_payment_date,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', p.id,
              'amount_paid', p.amount_paid,
              'payment_type', p.payment_type,
              'payment_date', p.payment_date,
              'payment_method', p.payment_method,
              'status', p.status,
              'receipt_number', p.receipt_number,
              'transaction_ref_id', COALESCE(
                substring(p.notes from '"bank_ref_id":\\s*"([^"]+)"'),
                substring(p.notes from '"promptpay_ref_id":\\s*"([^"]+)"')
              ),
              'image_path', CASE 
                WHEN substring(p.notes from '"payment_slip_id":\\s*"([^"]+)"') IS NOT NULL 
                THEN '/api/finance/revenue/slip-file?id=' || p.id 
                ELSE NULL 
              END
            ) ORDER BY p.payment_date DESC
          ) FILTER (WHERE p.id IS NOT NULL AND p.deleted_at IS NULL),
          '[]'::jsonb
        ) AS payments
      FROM slip_processing.v_maintenance_fee_status fs
      JOIN slip_processing.maintenance_fees mf ON mf.id = fs.id
      JOIN slip_processing.members m ON m.id = mf.member_id
      LEFT JOIN slip_processing.payments p ON p.maintenance_fee_id = mf.id
      ${where}
      GROUP BY mf.id, m.id, fs.effective_status
      ORDER BY
        CASE
          WHEN m.land_type = 'บ้านอยู่อาศัย' THEN 0
          WHEN m.land_type = 'ที่ดินเปล่า' THEN 1
          ELSE 2
        END ASC,
        COALESCE((
          SELECT string_agg(
            CASE
              WHEN part.match[1] ~ '^\\d+$' THEN lpad(part.match[1], 20, '0')
              ELSE lower(part.match[1])
            END,
            '|' ORDER BY part.ord
          )
          FROM regexp_matches(COALESCE(m.house_number, ''), '\\d+|[[:alpha:]]+', 'g') WITH ORDINALITY AS part(match, ord)
        ), COALESCE(m.house_number, '')) ASC,
        m.house_number ASC,
        mf.due_date DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const statsSql = `
      SELECT fs.effective_status AS status, COUNT(*)::int AS count, COALESCE(SUM(mf.amount_due), 0) AS total_due
      FROM slip_processing.v_maintenance_fee_status fs
      JOIN slip_processing.maintenance_fees mf ON mf.id = fs.id
      JOIN slip_processing.members m ON m.id = mf.member_id
      ${where}
      GROUP BY fs.effective_status`;

    const currentMonthStatsSql = `
      SELECT fs.effective_status AS status, COUNT(*)::int AS count, COALESCE(SUM(mf.amount_due), 0) AS total_due
      FROM slip_processing.v_maintenance_fee_status fs
      JOIN slip_processing.maintenance_fees mf ON mf.id = fs.id
      JOIN slip_processing.members m ON m.id = mf.member_id
      WHERE mf.deleted_at IS NULL
        AND m.deleted_at IS NULL
        AND mf.period_start >= date_trunc('month', CURRENT_DATE)::date
        AND mf.period_start < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
      GROUP BY fs.effective_status`;

    const currentYearStatsSql = `
      SELECT fs.effective_status AS status, COUNT(*)::int AS count, COALESCE(SUM(mf.amount_due), 0) AS total_due
      FROM slip_processing.v_maintenance_fee_status fs
      JOIN slip_processing.maintenance_fees mf ON mf.id = fs.id
      JOIN slip_processing.members m ON m.id = mf.member_id
      WHERE mf.deleted_at IS NULL
        AND m.deleted_at IS NULL
        AND mf.period_start >= date_trunc('year', CURRENT_DATE)::date
        AND mf.period_start < (date_trunc('year', CURRENT_DATE) + INTERVAL '1 year')::date
      GROUP BY fs.effective_status`;

    // STANDALONE / OTHER REVENUE QUERIES
    const otherParams: any[] = [];
    let otherWhere = "WHERE p.deleted_at IS NULL AND p.maintenance_fee_id IS NULL";
    if (q) {
      otherParams.push(`%${q}%`);
      otherWhere += ` AND (m.house_number ILIKE $${otherParams.length} OR m.owner_name ILIKE $${otherParams.length} OR p.notes ILIKE $${otherParams.length} OR p.receipt_number ILIKE $${otherParams.length})`;
    }
    if (status && status !== "all") {
      otherParams.push(status);
      otherWhere += ` AND p.status = $${otherParams.length}`;
    }
    if (paymentType && paymentType !== "all") {
      otherParams.push(paymentType);
      otherWhere += ` AND p.payment_type = $${otherParams.length}`;
    }
    if (from) {
      otherParams.push(from);
      otherWhere += ` AND p.payment_date >= $${otherParams.length}::date`;
    }
    if (to) {
      otherParams.push(to);
      otherWhere += ` AND p.payment_date <= $${otherParams.length}::date`;
    }

    const otherRowsSql = `
      SELECT
        p.id,
        p.member_id,
        COALESCE(m.house_number, '-') AS house_number,
        COALESCE(m.owner_name, 'ส่วนกลาง (Juristic)') AS owner_name,
        m.land_type,
        m.contact_info,
        NULL::date AS period_start,
        NULL::date AS period_end,
        p.payment_date AS due_date,
        p.amount_paid AS amount_due,
        p.payment_type AS payment_frequency,
        p.status AS status,
        p.status AS effective_status,
        p.payment_date AS paid_at,
        p.amount_paid AS amount_paid,
        p.payment_date AS last_payment_date,
        jsonb_build_array(
          jsonb_build_object(
            'id', p.id,
            'amount_paid', p.amount_paid,
            'payment_type', p.payment_type,
            'payment_date', p.payment_date,
            'payment_method', p.payment_method,
            'status', p.status,
            'receipt_number', p.receipt_number,
            'transaction_ref_id', COALESCE(
              substring(p.notes from '"bank_ref_id":\\s*"([^"]+)"'),
              substring(p.notes from '"promptpay_ref_id":\\s*"([^"]+)"')
            ),
            'image_path', CASE 
              WHEN substring(p.notes from '"payment_slip_id":\\s*"([^"]+)"') IS NOT NULL 
              THEN '/api/finance/revenue/slip-file?id=' || p.id 
              ELSE NULL 
            END
          )
        ) AS payments
      FROM slip_processing.payments p
      LEFT JOIN slip_processing.members m ON m.id = p.member_id
      ${otherWhere}
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT $${otherParams.length + 1} OFFSET $${otherParams.length + 2}`;

    const otherStatsSql = `
      SELECT p.status AS status, COUNT(*)::int AS count, COALESCE(SUM(p.amount_paid), 0) AS total_due
      FROM slip_processing.payments p
      LEFT JOIN slip_processing.members m ON m.id = p.member_id
      ${otherWhere}
      GROUP BY p.status`;

    const currentMonthOtherStatsSql = `
      SELECT p.payment_type AS status, COUNT(*)::int AS count, COALESCE(SUM(p.amount_paid), 0) AS total_due
      FROM slip_processing.payments p
      WHERE p.deleted_at IS NULL
        AND p.maintenance_fee_id IS NULL
        AND p.status <> 'voided'
        AND p.payment_date >= date_trunc('month', CURRENT_DATE)::date
        AND p.payment_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
      GROUP BY p.payment_type`;

    const currentYearOtherStatsSql = `
      SELECT p.payment_type AS status, COUNT(*)::int AS count, COALESCE(SUM(p.amount_paid), 0) AS total_due
      FROM slip_processing.payments p
      WHERE p.deleted_at IS NULL
        AND p.maintenance_fee_id IS NULL
        AND p.status <> 'voided'
        AND p.payment_date >= date_trunc('year', CURRENT_DATE)::date
        AND p.payment_date < (date_trunc('year', CURRENT_DATE) + INTERVAL '1 year')::date
      GROUP BY p.payment_type`;

    const membersSql = `
      SELECT id, house_number, owner_name, land_type, maintenance_fee
      FROM slip_processing.members
      WHERE deleted_at IS NULL
        AND member_status = 'active'
      ORDER BY
        CASE
          WHEN land_type = 'บ้านอยู่อาศัย' THEN 0
          WHEN land_type = 'ที่ดินเปล่า' THEN 1
          ELSE 2
        END ASC,
        COALESCE((
          SELECT string_agg(
            CASE
              WHEN part.match[1] ~ '^\\d+$' THEN lpad(part.match[1], 20, '0')
              ELSE lower(part.match[1])
            END,
            '|' ORDER BY part.ord
          )
          FROM regexp_matches(COALESCE(house_number, ''), '\\d+|[[:alpha:]]+', 'g') WITH ORDINALITY AS part(match, ord)
        ), COALESCE(house_number, '')) ASC,
        house_number ASC,
        owner_name ASC`;

    const feeOptionsSql = `
      SELECT
        mf.id,
        mf.member_id,
        m.house_number,
        m.owner_name,
        m.land_type,
        mf.period_start,
        mf.period_end,
        mf.due_date,
        mf.amount_due,
        mf.payment_frequency,
        fs.effective_status
      FROM slip_processing.v_maintenance_fee_status fs
      JOIN slip_processing.maintenance_fees mf ON mf.id = fs.id
      JOIN slip_processing.members m ON m.id = mf.member_id
      WHERE mf.deleted_at IS NULL
        AND m.deleted_at IS NULL
        AND mf.status <> 'cancelled'
      ORDER BY
        CASE
          WHEN m.land_type = 'บ้านอยู่อาศัย' THEN 0
          WHEN m.land_type = 'ที่ดินเปล่า' THEN 1
          ELSE 2
        END ASC,
        COALESCE((
          SELECT string_agg(
            CASE
              WHEN part.match[1] ~ '^\\d+$' THEN lpad(part.match[1], 20, '0')
              ELSE lower(part.match[1])
            END,
            '|' ORDER BY part.ord
          )
          FROM regexp_matches(COALESCE(m.house_number, ''), '\\d+|[[:alpha:]]+', 'g') WITH ORDINALITY AS part(match, ord)
        ), COALESCE(m.house_number, '')) ASC,
        m.house_number ASC,
        mf.period_start DESC,
        m.owner_name ASC
      LIMIT 1000`;

    let rowsPromise, statsPromise, monthPromise, yearPromise;
    if (tab === "other") {
      rowsPromise = query(otherRowsSql, [...otherParams, limit, offset]);
      statsPromise = query(otherStatsSql, otherParams);
      monthPromise = query(currentMonthOtherStatsSql);
      yearPromise = query(currentYearOtherStatsSql);
    } else {
      rowsPromise = query(rowsSql, [...params, limit, offset]);
      statsPromise = query(statsSql, params);
      monthPromise = query(currentMonthStatsSql);
      yearPromise = query(currentYearStatsSql);
    }

    const [rows, stats, currentMonthStats, currentYearStats, membersList, feeOptionsList] = await Promise.all([
      rowsPromise,
      statsPromise,
      monthPromise,
      yearPromise,
      query(membersSql),
      query(feeOptionsSql),
    ]);

    return NextResponse.json({
      revenue: rows.rows,
      stats: stats.rows,
      monthly_stats: currentMonthStats.rows,
      yearly_stats: currentYearStats.rows,
      members: membersList.rows,
      fee_options: feeOptionsList.rows,
      limit,
      offset,
    });
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

    if (action === "member") {
      const houseNumber = requiredString(body.house_number, "house_number");
      const ownerName = requiredString(body.owner_name, "owner_name");
      const result = await client.query(
        `INSERT INTO slip_processing.members (house_number, owner_name, contact_info, web_user_id, notes)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING *`,
        [houseNumber, ownerName, body.contact_info || {}, body.web_user_id || null, body.notes || null]
      );
      await client.query("COMMIT");
      return NextResponse.json({ success: true, member: result.rows[0] }, { status: 201 });
    }

    if (action === "maintenance_fee") {
      const paymentFrequency = requiredString(body.payment_frequency, "payment_frequency");
      if (!paymentTypes.has(paymentFrequency)) badRequest("Invalid payment_frequency");
      const status = body.status || "pending";
      if (!feeStatuses.has(status)) badRequest("Invalid status");
      const result = await client.query(
        `INSERT INTO slip_processing.maintenance_fees
          (member_id, fee_code, period_start, period_end, due_date, amount_due, payment_frequency, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          requiredString(body.member_id, "member_id"),
          body.fee_code || null,
          requiredString(body.period_start, "period_start"),
          requiredString(body.period_end, "period_end"),
          requiredString(body.due_date, "due_date"),
          positiveMoney(body.amount_due, "amount_due"),
          paymentFrequency,
          status,
          body.notes || null,
        ]
      );
      await client.query("COMMIT");
      return NextResponse.json({ success: true, maintenance_fee: result.rows[0] }, { status: 201 });
    }

    if (action === "payment") {
      const paymentType = requiredString(body.payment_type, "payment_type");
      if (!paymentTypes.has(paymentType)) badRequest("Invalid payment_type");
      const amountPaid = positiveMoney(body.amount_paid, "amount_paid");

      let finalNotes = body.notes || "";
      let slipIdToUse = body.payment_slip_id || null;
      let refIdToUse = body.transaction_ref_id !== undefined ? body.transaction_ref_id?.trim() : null;

      const metaObj: Record<string, string | null> = {};
      if (slipIdToUse) metaObj.payment_slip_id = slipIdToUse;
      if (refIdToUse) {
        metaObj.bank_ref_id = refIdToUse;
        metaObj.promptpay_ref_id = refIdToUse;
      }

      const cleanPlainNotes = finalNotes.trim();

      if (Object.keys(metaObj).length > 0) {
        finalNotes = cleanPlainNotes 
          ? `${cleanPlainNotes} ${JSON.stringify(metaObj)}` 
          : JSON.stringify(metaObj);
      } else {
        finalNotes = cleanPlainNotes || null;
      }

      const memberId = body.member_id && body.member_id !== "null" && body.member_id !== "" ? body.member_id : null;

      const result = await client.query(
        `INSERT INTO slip_processing.payments
          (member_id, maintenance_fee_id, amount_paid, payment_type, payment_date, payment_method, bank_statement_line_id, receipt_number, status, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          memberId,
          body.maintenance_fee_id || null,
          amountPaid,
          paymentType,
          requiredString(body.payment_date, "payment_date"),
          body.payment_method || "bank_transfer",
          body.bank_statement_line_id || null,
          body.receipt_number || null,
          body.status || "confirmed",
          finalNotes,
          user.id,
        ]
      );

      if (body.maintenance_fee_id) {
        await client.query(
          `UPDATE slip_processing.maintenance_fees mf
           SET status = CASE
                WHEN COALESCE((SELECT SUM(amount_paid) FROM slip_processing.payments p WHERE p.maintenance_fee_id = mf.id AND p.deleted_at IS NULL AND p.status <> 'voided'), 0) >= mf.amount_due THEN 'paid'
                ELSE mf.status
              END,
              paid_at = CASE
                WHEN COALESCE((SELECT SUM(amount_paid) FROM slip_processing.payments p WHERE p.maintenance_fee_id = mf.id AND p.deleted_at IS NULL AND p.status <> 'voided'), 0) >= mf.amount_due THEN NOW()
                ELSE mf.paid_at
              END,
              updated_at = NOW()
           WHERE mf.id = $1`,
          [body.maintenance_fee_id]
        );
      }

      await client.query("COMMIT");
      return NextResponse.json({ success: true, payment: result.rows[0] }, { status: 201 });
    }

    if (action === "edit_payment") {
      const paymentId = requiredString(body.payment_id, "payment_id");
      const amountPaid = positiveMoney(body.amount_paid, "amount_paid");
      const paymentDate = requiredString(body.payment_date, "payment_date");
      const paymentMethod = body.payment_method || "bank_transfer";
      const receiptNumber = body.receipt_number || null;

      const payRes = await client.query(
        `SELECT maintenance_fee_id, notes FROM slip_processing.payments WHERE id = $1 AND deleted_at IS NULL`,
        [paymentId]
      );
      if (payRes.rows.length === 0) {
        badRequest("Payment record not found");
      }
      const maintenanceFeeId = payRes.rows[0].maintenance_fee_id;

      let finalNotes = body.notes || "";
      let slipIdToUse = body.payment_slip_id || null;
      let refIdToUse = body.transaction_ref_id !== undefined ? body.transaction_ref_id?.trim() : null;

      const oldNotes = payRes.rows[0].notes || "";

      if (!slipIdToUse) {
        const match = oldNotes.match(/"payment_slip_id":\s*"([^"]+)"/);
        if (match) slipIdToUse = match[1];
      }

      if (refIdToUse === null) {
        const matchBank = oldNotes.match(/"bank_ref_id":\s*"([^"]+)"/);
        const matchPP = oldNotes.match(/"promptpay_ref_id":\s*"([^"]+)"/);
        refIdToUse = matchBank ? matchBank[1] : (matchPP ? matchPP[1] : null);
      }

      const metaObj: Record<string, string | null> = {};
      if (slipIdToUse) metaObj.payment_slip_id = slipIdToUse;
      if (refIdToUse) {
        metaObj.bank_ref_id = refIdToUse;
        metaObj.promptpay_ref_id = refIdToUse;
      }

      // Strip any old JSON object from the plain text notes to avoid duplicate JSON blocks
      const cleanPlainNotes = finalNotes.replace(/\{"payment_slip_id":\s*"[^"]+"[^}]*\}/, "")
                                        .replace(/\{"bank_ref_id":\s*"[^"]+"[^}]*\}/, "")
                                        .trim();

      if (Object.keys(metaObj).length > 0) {
        finalNotes = cleanPlainNotes 
          ? `${cleanPlainNotes} ${JSON.stringify(metaObj)}` 
          : JSON.stringify(metaObj);
      } else {
        finalNotes = cleanPlainNotes || null;
      }

      const result = await client.query(
        `UPDATE slip_processing.payments
         SET amount_paid = $1,
             payment_date = $2,
             payment_method = $3,
             receipt_number = $4,
             notes = $5,
             updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [amountPaid, paymentDate, paymentMethod, receiptNumber, finalNotes, paymentId]
      );

      const inputStatus = body.status || null;

      if (maintenanceFeeId) {
        if (inputStatus && feeStatuses.has(inputStatus)) {
          await client.query(
            `UPDATE slip_processing.maintenance_fees mf
             SET status = $1::text,
                 paid_at = CASE WHEN $1::text = 'paid' THEN NOW() ELSE NULL END,
                 updated_at = NOW()
             WHERE mf.id = $2`,
            [inputStatus, maintenanceFeeId]
          );
        } else {
          await client.query(
            `UPDATE slip_processing.maintenance_fees mf
             SET status = CASE
                  WHEN COALESCE((SELECT SUM(amount_paid) FROM slip_processing.payments p WHERE p.maintenance_fee_id = mf.id AND p.deleted_at IS NULL AND p.status <> 'voided'), 0) >= mf.amount_due THEN 'paid'
                  ELSE 'pending'
                END,
                paid_at = CASE
                  WHEN COALESCE((SELECT SUM(amount_paid) FROM slip_processing.payments p WHERE p.maintenance_fee_id = mf.id AND p.deleted_at IS NULL AND p.status <> 'voided'), 0) >= mf.amount_due THEN NOW()
                  ELSE NULL
                END,
                updated_at = NOW()
             WHERE mf.id = $1`,
            [maintenanceFeeId]
          );
        }
      }

      await client.query("COMMIT");
      return NextResponse.json({ success: true, payment: result.rows[0] });
    }

    badRequest("Invalid revenue action");
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  } finally {
    client.release();
  }
}
