import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import crypto from "crypto";

export async function GET() {
  try {
    await requireAdmin();
    const r = await query(`
      SELECT id, title_th, title_en, description_th, description_en, category,
             file_name, file_path, file_size_bytes, mime_type, is_active, sort_order, published_at, created_at, updated_at
      FROM slip_processing.documents
      WHERE deleted_at IS NULL
      ORDER BY sort_order ASC, published_at DESC NULLS LAST, created_at DESC
      LIMIT 200
    `);
    return NextResponse.json({ documents: r.rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const id = crypto.randomUUID();
    await query(
      `INSERT INTO slip_processing.documents
       (id, title_th, title_en, description_th, description_en, category, file_name, file_path, file_size_bytes, mime_type, is_active, sort_order, published_at, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),$13,NOW(),NOW())`,
      [id, body.title_th, body.title_en || null, body.description_th || null, body.description_en || null, body.category || "rules", body.file_name || null, body.file_path || null, Number(body.file_size_bytes || 0), body.mime_type || null, body.is_active !== false, Number(body.sort_order || 0), admin.linkedUserId || null]
    );
    await query(
      `INSERT INTO slip_processing.notifications (id, title_th, title_en, message_th, message_en, type, target_url, created_at)
       VALUES ($1,$2,$3,$4,$5,'document',$6,NOW())`,
      [crypto.randomUUID(), "เอกสารใหม่", "New document", body.title_th, body.title_en || body.title_th, `/documents`]
    );
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
