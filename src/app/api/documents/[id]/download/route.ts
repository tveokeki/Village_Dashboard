import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { stat, readFile } from "fs/promises";
import path from "path";

function safePublicPath(filePath: string) {
  if (!filePath || !filePath.startsWith("/")) return null;
  const publicRoot = path.join(process.cwd(), "public");
  const fullPath = path.normalize(path.join(publicRoot, filePath));
  if (!fullPath.startsWith(publicRoot)) return null;
  return fullPath;
}

function asciiFallback(name: string) {
  return name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await query(
      `SELECT id, title_th, file_name, file_path, mime_type
       FROM slip_processing.documents
       WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const doc = result.rows[0];
    const fullPath = safePublicPath(doc.file_path);
    if (!fullPath) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    try {
      await stat(fullPath);
    } catch {
      return NextResponse.json({ error: "File is not available on server" }, { status: 404 });
    }

    const file = await readFile(fullPath);
    const fileName = doc.file_name || path.basename(fullPath);
    const encoded = encodeURIComponent(fileName);

    return new NextResponse(file, {
      headers: {
        "Content-Type": doc.mime_type || "application/octet-stream",
        "Content-Length": String(file.length),
        "Content-Disposition": `attachment; filename="${asciiFallback(fileName)}"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Download failed" }, { status: 500 });
  }
}
