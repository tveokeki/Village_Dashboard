import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

const mimeFallback: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const { id } = await params;
    const r = await query(
      `SELECT t.image_path, t.image_mime_type
       FROM slip_processing.problem_tickets t
       WHERE t.id=$1 AND t.deleted_at IS NULL`,
      [id]
    );
    if (!r.rows[0]?.image_path) return NextResponse.json({ error: "Image not found" }, { status: 404 });

    const imagePath = String(r.rows[0].image_path);
    if (!imagePath.startsWith("/uploads/")) return NextResponse.json({ error: "Invalid image path" }, { status: 400 });

    const publicRoot = path.join(process.cwd(), "public");
    const fullPath = path.normalize(path.join(publicRoot, imagePath));
    if (!fullPath.startsWith(publicRoot)) return NextResponse.json({ error: "Invalid image path" }, { status: 400 });

    const s = await stat(fullPath);
    if (!s.isFile()) return NextResponse.json({ error: "Image not found" }, { status: 404 });

    const bytes = await readFile(fullPath);
    const contentType = r.rows[0].image_mime_type || mimeFallback[path.extname(fullPath).toLowerCase()] || "application/octet-stream";
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: err.status || 500 });
  }
}
