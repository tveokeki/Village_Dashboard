import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { access } from "fs/promises";
import path from "path";

async function fileExists(filePath: string | null) {
  if (!filePath || !filePath.startsWith("/")) return false;
  const publicRoot = path.join(process.cwd(), "public");
  const fullPath = path.normalize(path.join(publicRoot, filePath));
  if (!fullPath.startsWith(publicRoot)) return false;
  try {
    await access(fullPath);
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");

    let sql = `SELECT id, title_th, title_en, content_th, content_en, category, is_pinned, published_at, COALESCE(image_path, cover_image_path) AS cover_image_path
               FROM slip_processing.announcements
               WHERE deleted_at IS NULL AND is_published = TRUE`;
    const params: string[] = [];

    if (category && category !== "all") {
      sql += ` AND category = $1`;
      params.push(category);
    }

    sql += ` ORDER BY is_pinned DESC, published_at DESC LIMIT 50`;

    const result = await query(sql, params);
    const announcements = await Promise.all(
      result.rows.map(async (announcement) => ({
        ...announcement,
        image_available: await fileExists(announcement.cover_image_path),
      }))
    );
    return NextResponse.json({ announcements });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
