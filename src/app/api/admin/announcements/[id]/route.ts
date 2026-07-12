import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdminOrManager } from "@/lib/session";
import { autoTranslateAnnouncementEnglish } from "@/lib/sharon-translation";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOrManager();
    const { id } = await params;
    const body = await autoTranslateAnnouncementEnglish(await req.json());
    await query(
      `UPDATE slip_processing.announcements
       SET title_th=$2, title_en=$3, content_th=$4, content_en=$5, category=$6,
           is_pinned=$7, is_published=$8, cover_image_path=$9, image_path=$9,
           updated_at=NOW(), published_at=CASE WHEN $8 = TRUE AND published_at IS NULL THEN NOW() ELSE published_at END
       WHERE id=$1 AND deleted_at IS NULL`,
      [id, body.title_th, body.title_en || null, body.content_th || "", body.content_en || null, body.category || "general", Boolean(body.is_pinned), body.is_published !== false, body.image_path || null]
    );
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOrManager();
    const { id } = await params;
    await query("UPDATE slip_processing.announcements SET deleted_at = NOW(), updated_at = NOW() WHERE id=$1", [id]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
