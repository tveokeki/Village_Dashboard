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

    let sql = `
      SELECT id, title_th, title_en, description_th, description_en, category,
             file_name, file_path, file_size_bytes, mime_type, published_at
      FROM slip_processing.documents
      WHERE deleted_at IS NULL AND is_active = TRUE
    `;
    const params: any[] = [];

    if (category && category !== "all") {
      sql += " AND category = $1";
      params.push(category);
    }

    sql += " ORDER BY sort_order ASC, published_at DESC";
    const result = await query(sql, params);
    const documents = await Promise.all(
      result.rows.map(async (doc) => ({
        ...doc,
        file_available: await fileExists(doc.file_path),
      }))
    );
    return NextResponse.json({ documents });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
