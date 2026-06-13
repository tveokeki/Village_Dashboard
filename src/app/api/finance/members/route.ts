import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireFinanceAccess } from "@/lib/finance-auth";
import { badRequest, parseLimit, parseOffset, positiveMoney, requiredString } from "@/lib/finance-utils";

export const dynamic = "force-dynamic";

const memberStatuses = new Set(["active", "inactive", "suspended"]);

function optionalNumber(value: any) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) badRequest("Invalid number value");
  return n;
}

function contactInfo(body: any) {
  return {
    phone: body.phone || "",
    email: body.email || "",
    line_id: body.line_id || "",
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireFinanceAccess();
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q")?.trim();
    const status = searchParams.get("status")?.trim();
    const limit = parseLimit(searchParams.get("limit"), 100, 500);
    const offset = parseOffset(searchParams.get("offset"));

    const params: any[] = [];
    const where = ["deleted_at IS NULL"];
    if (q) {
      params.push(`%${q}%`);
      const n = params.length;
      where.push(`(
        house_number ILIKE $${n}
        OR owner_name ILIKE $${n}
        OR COALESCE(land_type, '') ILIKE $${n}
        OR COALESCE(notes, '') ILIKE $${n}
        OR COALESCE(contact_info->>'phone', '') ILIKE $${n}
        OR COALESCE(contact_info->>'email', '') ILIKE $${n}
        OR COALESCE(contact_info->>'line_id', '') ILIKE $${n}
      )`);
    }
    if (status && status !== "all") {
      params.push(status);
      where.push(`member_status = $${params.length}`);
    }

    const rowsSql = `
      SELECT
        id, web_user_id, house_number, owner_name, contact_info, member_status,
        notes, land_type, area, land_count, maintenance_fee, source_file,
        created_at, updated_at
      FROM slip_processing.members
      WHERE ${where.join(" AND ")}
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
        owner_name ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const statsSql = `
      SELECT member_status AS status, COUNT(*)::int AS count, COALESCE(SUM(maintenance_fee), 0) AS total_maintenance_fee
      FROM slip_processing.members
      WHERE deleted_at IS NULL
      GROUP BY member_status`;

    const [members, stats] = await Promise.all([
      query(rowsSql, [...params, limit, offset]),
      query(statsSql),
    ]);

    return NextResponse.json({ members: members.rows, stats: stats.rows, limit, offset });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireFinanceAccess();
    const body = await req.json();
    const status = body.member_status || "active";
    if (!memberStatuses.has(status)) badRequest("Invalid member_status");

    const result = await query(
      `INSERT INTO slip_processing.members
        (house_number, owner_name, contact_info, member_status, notes, land_type, area, land_count, maintenance_fee, source_file)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, house_number, owner_name, contact_info, member_status, notes, land_type, area, land_count, maintenance_fee, source_file, created_at, updated_at`,
      [
        requiredString(body.house_number, "house_number"),
        requiredString(body.owner_name, "owner_name"),
        contactInfo(body),
        status,
        body.notes || null,
        body.land_type || null,
        optionalNumber(body.area),
        optionalNumber(body.land_count),
        body.maintenance_fee ? positiveMoney(body.maintenance_fee, "maintenance_fee") : null,
        body.source_file || "manual",
      ]
    );

    return NextResponse.json({ success: true, member: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireFinanceAccess();
    const body = await req.json();
    const id = requiredString(body.id, "id");
    const status = body.member_status || "active";
    if (!memberStatuses.has(status)) badRequest("Invalid member_status");

    const result = await query(
      `UPDATE slip_processing.members
       SET house_number = $2,
           owner_name = $3,
           contact_info = $4,
           member_status = $5,
           notes = $6,
           land_type = $7,
           area = $8,
           land_count = $9,
           maintenance_fee = $10,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, house_number, owner_name, contact_info, member_status, notes, land_type, area, land_count, maintenance_fee, source_file, created_at, updated_at`,
      [
        id,
        requiredString(body.house_number, "house_number"),
        requiredString(body.owner_name, "owner_name"),
        contactInfo(body),
        status,
        body.notes || null,
        body.land_type || null,
        optionalNumber(body.area),
        optionalNumber(body.land_count),
        body.maintenance_fee ? positiveMoney(body.maintenance_fee, "maintenance_fee") : null,
      ]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    return NextResponse.json({ success: true, member: result.rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireFinanceAccess();
    const id = req.nextUrl.searchParams.get("id") || (await req.json().catch(() => ({}))).id;
    if (!id) badRequest("id is required");
    const result = await query(
      `UPDATE slip_processing.members
       SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id, user.id]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
