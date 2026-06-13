import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireFinanceAccess } from "@/lib/finance-auth";
import { parseLimit, parseOffset } from "@/lib/finance-utils";

export const dynamic = "force-dynamic";

type ReportPeriod = {
  key: string;
  period_start: string;
  period_end: string;
  due_date: string | null;
  label_th: string;
  label_en: string;
};

type ReportCell = {
  period_key: string;
  maintenance_fee_id: string | null;
  amount_due: number;
  amount_paid: number;
  status: "paid" | "overdue" | "pending" | "none";
  due_date: string | null;
  last_payment_date: string | null;
};

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function formatPeriodLabel(start: string, lang: "th" | "en") {
  const date = new Date(`${start}T00:00:00`);
  return date.toLocaleDateString(lang === "th" ? "th-TH" : "en-US", { month: "short", year: "numeric" });
}

function normalizeStatus(status: string | null): "paid" | "overdue" | "pending" {
  if (status === "paid" || status === "confirmed") return "paid";
  if (status === "overdue") return "overdue";
  return "pending";
}

export async function GET(req: NextRequest) {
  try {
    await requireFinanceAccess();
    const { searchParams } = req.nextUrl;
    const today = new Date();
    const defaultFrom = `${today.getFullYear()}-01-01`;
    const defaultTo = isoDate(today);
    const from = searchParams.get("from")?.trim() || defaultFrom;
    const to = searchParams.get("to")?.trim() || defaultTo;
    const q = searchParams.get("q")?.trim() || "";
    const limit = parseLimit(searchParams.get("limit"), 200, 500);
    const offset = parseOffset(searchParams.get("offset"));

    if (!isValidDate(from)) return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
    if (!isValidDate(to)) return NextResponse.json({ error: "Invalid to date" }, { status: 400 });
    if (from > to) return NextResponse.json({ error: "from must be before or equal to to" }, { status: 400 });

    const params: any[] = [from, to];
    let memberWhere = "WHERE m.deleted_at IS NULL";
    if (q) {
      params.push(`%${q}%`);
      memberWhere += ` AND (m.owner_name ILIKE $${params.length} OR m.house_number ILIKE $${params.length})`;
    }

    const periodsSql = `
      SELECT
        CONCAT(mf.period_start::date, '|', mf.period_end::date) AS key,
        mf.period_start::date::text AS period_start,
        mf.period_end::date::text AS period_end,
        MIN(mf.due_date)::date::text AS due_date
      FROM slip_processing.maintenance_fees mf
      JOIN slip_processing.members m ON m.id = mf.member_id
      ${memberWhere}
        AND mf.deleted_at IS NULL
        AND mf.status <> 'cancelled'
        AND mf.period_start::date >= $1::date
        AND mf.period_start::date <= $2::date
      GROUP BY mf.period_start::date, mf.period_end::date
      ORDER BY mf.period_start::date ASC, mf.period_end::date ASC`;

    const membersSql = `
      SELECT DISTINCT
        m.id,
        m.house_number,
        m.owner_name,
        m.land_type,
        CASE
          WHEN m.land_type = 'บ้านอยู่อาศัย' THEN 0
          WHEN m.land_type = 'ที่ดินเปล่า' THEN 1
          ELSE 2
        END AS land_type_sort,
        COALESCE((
          SELECT string_agg(
            CASE
              WHEN part.match[1] ~ '^\\d+$' THEN lpad(part.match[1], 20, '0')
              ELSE lower(part.match[1])
            END,
            '|' ORDER BY part.ord
          )
          FROM regexp_matches(COALESCE(m.house_number, ''), '\\d+|[[:alpha:]]+', 'g') WITH ORDINALITY AS part(match, ord)
        ), COALESCE(m.house_number, '')) AS house_number_sort
      FROM slip_processing.members m
      JOIN slip_processing.maintenance_fees mf ON mf.member_id = m.id
      ${memberWhere}
        AND mf.deleted_at IS NULL
        AND mf.status <> 'cancelled'
        AND mf.period_start::date >= $1::date
        AND mf.period_start::date <= $2::date
      ORDER BY land_type_sort ASC, house_number_sort ASC, m.house_number ASC, m.owner_name ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const feesSql = `
      SELECT
        mf.id,
        mf.member_id,
        CONCAT(mf.period_start::date, '|', mf.period_end::date) AS period_key,
        mf.period_start::date::text AS period_start,
        mf.period_end::date::text AS period_end,
        mf.due_date::date::text AS due_date,
        mf.amount_due,
        fs.effective_status,
        COALESCE(SUM(p.amount_paid) FILTER (WHERE p.deleted_at IS NULL AND p.status <> 'voided'), 0) AS amount_paid,
        (MAX(p.payment_date) FILTER (WHERE p.deleted_at IS NULL AND p.status <> 'voided'))::date::text AS last_payment_date
      FROM slip_processing.v_maintenance_fee_status fs
      JOIN slip_processing.maintenance_fees mf ON mf.id = fs.id
      JOIN slip_processing.members m ON m.id = mf.member_id
      LEFT JOIN slip_processing.payments p ON p.maintenance_fee_id = mf.id
      ${memberWhere}
        AND mf.deleted_at IS NULL
        AND mf.status <> 'cancelled'
        AND mf.period_start::date >= $1::date
        AND mf.period_start::date <= $2::date
      GROUP BY mf.id, fs.effective_status, m.house_number, m.land_type
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
        mf.period_start::date ASC`;

    const [periodResult, memberResult, feeResult] = await Promise.all([
      query(periodsSql, params),
      query(membersSql, [...params, limit, offset]),
      query(feesSql, params),
    ]);

    const periods: ReportPeriod[] = periodResult.rows.map((row: any) => ({
      key: row.key,
      period_start: row.period_start,
      period_end: row.period_end,
      due_date: row.due_date,
      label_th: formatPeriodLabel(row.period_start, "th"),
      label_en: formatPeriodLabel(row.period_start, "en"),
    }));

    const feesByMemberPeriod = new Map<string, any>();
    for (const fee of feeResult.rows) {
      feesByMemberPeriod.set(`${fee.member_id}:${fee.period_key}`, fee);
    }

    const rows = memberResult.rows.map((member: any) => {
      const cells: ReportCell[] = periods.map((period) => {
        const fee = feesByMemberPeriod.get(`${member.id}:${period.key}`);
        if (!fee) {
          return { period_key: period.key, maintenance_fee_id: null, amount_due: 0, amount_paid: 0, status: "none", due_date: period.due_date, last_payment_date: null };
        }
        return {
          period_key: period.key,
          maintenance_fee_id: fee.id,
          amount_due: Number(fee.amount_due || 0),
          amount_paid: Number(fee.amount_paid || 0),
          status: normalizeStatus(fee.effective_status),
          due_date: fee.due_date,
          last_payment_date: fee.last_payment_date,
        };
      });
      const summary = cells.reduce(
        (acc, cell) => {
          if (cell.status === "paid") acc.paid += 1;
          if (cell.status === "overdue") acc.overdue += 1;
          if (cell.status === "pending") acc.pending += 1;
          acc.total_due += Number(cell.amount_due || 0);
          acc.total_paid += Number(cell.amount_paid || 0);
          return acc;
        },
        { paid: 0, overdue: 0, pending: 0, total_due: 0, total_paid: 0 }
      );
      return {
        member_id: member.id,
        house_number: member.house_number,
        owner_name: member.owner_name,
        land_type: member.land_type,
        cells,
        summary,
      };
    });

    return NextResponse.json({
      from,
      to,
      q,
      periods,
      rows,
      limit,
      offset,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
