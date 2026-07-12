import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdminOrManager } from "@/lib/session";
import { announcementDetailUrl, broadcastAnnouncementToLine } from "@/lib/line-announcement-broadcast";
import { autoTranslateAnnouncementEnglish } from "@/lib/sharon-translation";
import crypto from "crypto";

export async function GET() {
  try {
    await requireAdminOrManager();
    const r = await query(`
      SELECT id, title_th, title_en, content_th, content_en, category, is_pinned, is_published,
             COALESCE(image_path, cover_image_path) AS image_path, published_at, created_at, updated_at
      FROM slip_processing.announcements
      WHERE deleted_at IS NULL
      ORDER BY is_pinned DESC, published_at DESC NULLS LAST, created_at DESC
      LIMIT 200
    `);
    return NextResponse.json({ announcements: r.rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminOrManager();
    const body = await autoTranslateAnnouncementEnglish(await req.json());
    const id = crypto.randomUUID();
    const publishedAt = body.is_published === false ? null : new Date().toISOString();
    await query(
      `INSERT INTO slip_processing.announcements
       (id, title_th, title_en, content_th, content_en, category, is_pinned, is_published, cover_image_path, image_path, published_at, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,NOW(),NOW())`,
      [
        id,
        body.title_th,
        body.title_en || null,
        body.content_th || "",
        body.content_en || null,
        body.category || "general",
        Boolean(body.is_pinned),
        body.is_published !== false,
        body.image_path || null,
        publishedAt,
        admin.linkedUserId || null,
      ]
    );
    let lineBroadcast = null;
    if (body.is_published !== false) {
      const announcement = {
        id,
        title_th: body.title_th,
        title_en: body.title_en || null,
        content_th: body.content_th || "",
        content_en: body.content_en || null,
      };
      const targetUrl = announcementDetailUrl(announcement).replace(
        (process.env.PUBLIC_ORIGIN || process.env.NEXTAUTH_URL || "https://suan-ake.cloud").replace(/\/$/, ""),
        "",
      );

      await query(
        `INSERT INTO slip_processing.notifications (id, title_th, title_en, message_th, message_en, type, target_url, created_at)
         VALUES ($1,$2,$3,$4,$5,'announcement',$6,NOW())`,
        [crypto.randomUUID(), "ประกาศใหม่", "New announcement", body.title_th, body.title_en || body.title_th, targetUrl]
      );

      lineBroadcast = await broadcastAnnouncementToLine(announcement);
    }
    return NextResponse.json({ success: true, id, line_broadcast: lineBroadcast });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
