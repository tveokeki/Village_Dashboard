import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { stat, readFile } from "fs/promises";
import path from "path";

function safePublicPath(filePath: string | null) {
  if (!filePath || !filePath.startsWith("/")) return null;
  const publicRoot = path.join(process.cwd(), "public");
  const fullPath = path.normalize(path.join(publicRoot, filePath));
  if (!fullPath.startsWith(publicRoot)) return null;
  return fullPath;
}

function contentTypeFromPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await query(
      `SELECT id, COALESCE(image_path, cover_image_path) AS image_path
       FROM slip_processing.announcements
       WHERE id = $1 AND deleted_at IS NULL AND is_published = TRUE`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
    }

    const imagePath = result.rows[0].image_path as string | null;
    const fullPath = safePublicPath(imagePath);
    if (!fullPath) {
      return NextResponse.json({ error: "Image not available" }, { status: 404 });
    }

    let info;
    try {
      info = await stat(fullPath);
      if (!info.isFile()) throw new Error("not a file");
    } catch {
      return NextResponse.json({ error: "Image file is not available on server" }, { status: 404 });
    }

    const file = await readFile(fullPath);
    return new NextResponse(file, {
      headers: {
        "Content-Type": contentTypeFromPath(fullPath),
        "Content-Length": String(file.length),
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Image failed" }, { status: 500 });
  }
}
