import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await req.json();
    await query(
      "UPDATE slip_processing.web_users SET role=$2, is_admin=$3, notification_enabled=$4 WHERE id=$1 AND deleted_at IS NULL",
      [id, body.role || "resident", Boolean(body.is_admin), body.notification_enabled !== false]
    );
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
