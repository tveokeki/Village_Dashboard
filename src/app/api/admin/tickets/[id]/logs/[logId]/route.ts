import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdminOrManager } from "@/lib/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; logId: string }> }) {
  try {
    const admin = await requireAdminOrManager();
    const { id, logId } = await params;
    const body = await req.json();
    const note = String(body.note || "").trim();
    if (!note) return NextResponse.json({ error: "Note is required" }, { status: 400 });

    const current = await query(
      `SELECT id, ticket_id, created_by
       FROM slip_processing.ticket_progress_logs
       WHERE id=$1 AND ticket_id=$2 AND deleted_at IS NULL`,
      [logId, id]
    );
    if (current.rows.length === 0) return NextResponse.json({ error: "Progress log not found" }, { status: 404 });
    const log = current.rows[0];
    if (!log.created_by || log.created_by !== admin.id) {
      return NextResponse.json({ error: "Only the author can edit this log" }, { status: 403 });
    }

    const result = await query(
      `UPDATE slip_processing.ticket_progress_logs
       SET note=$3, edited_at=NOW(), edited_by=$4, edited_by_name=$5
       WHERE id=$1 AND ticket_id=$2 AND created_by=$4 AND deleted_at IS NULL
       RETURNING id, ticket_id, status, priority, assigned_to, note, created_by, created_by_name, created_at, edited_at, edited_by_name`,
      [logId, id, note, admin.id, admin.name || admin.email || "Admin"]
    );
    return NextResponse.json({ success: true, log: { ...result.rows[0], can_edit: true } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
