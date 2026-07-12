import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager } from "@/lib/session";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const allowed = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export async function POST(req: NextRequest) {
  try {
    await requireAdminOrManager();
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const type = String(form.get("type") || "documents");
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (!allowed.has(file.type)) return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });

    const ext = path.extname(file.name || "") || ".bin";
    const safeType = type === "announcements" ? "announcements" : "documents";
    const dir = path.join(process.cwd(), "public", "uploads", safeType);
    await mkdir(dir, { recursive: true });
    const fileName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    const diskPath = path.join(dir, fileName);
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(diskPath, bytes);

    return NextResponse.json({
      success: true,
      file_name: file.name,
      file_path: `/uploads/${safeType}/${fileName}`,
      file_size_bytes: file.size,
      mime_type: file.type,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
