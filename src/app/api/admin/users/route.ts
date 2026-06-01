import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  try {
    await requireAdmin();
    const r = await query(`
      SELECT id, email, display_name, house_number, role, is_admin, notification_enabled, last_login_at, created_at
      FROM slip_processing.web_users
      WHERE deleted_at IS NULL
      ORDER BY is_admin DESC, last_login_at DESC NULLS LAST, created_at DESC
      LIMIT 200
    `);
    return NextResponse.json({ users: r.rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
