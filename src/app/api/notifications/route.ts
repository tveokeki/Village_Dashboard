import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser, requireAdminOrManager } from "@/lib/session";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const mineOnly = req.nextUrl.searchParams.get("mine") === "1";
    const adminView = user.isAdmin && !mineOnly;
    const r = await query(
      `SELECT id, user_id, title_th, title_en, message_th, message_en, type, target_url, is_read, sent_line, sent_email, created_at, read_at
       FROM slip_processing.notifications
       WHERE ($1::boolean = true) OR (user_id IS NULL OR user_id=$2)
       ORDER BY created_at DESC LIMIT 100`,
      [adminView, user.id]
    );
    return NextResponse.json({ notifications: r.rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminOrManager();
    const body = await req.json();
    const id = crypto.randomUUID();
    await query(
      `INSERT INTO slip_processing.notifications (id, user_id, title_th, title_en, message_th, message_en, type, target_url, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [id, body.user_id || null, body.title_th, body.title_en || null, body.message_th, body.message_en || null, body.type || "general", body.target_url || null]
    );
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
