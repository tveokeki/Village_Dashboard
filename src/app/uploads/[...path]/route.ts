import { NextRequest, NextResponse } from "next/server";
import { stat, readFile } from "fs/promises";
import path from "path";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: pathSegments } = await params;
    if (!pathSegments || pathSegments.length === 0) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    // Limit to allowed safe folders (announcements, documents, tickets, resident registration images)
    let safeType = "documents";
    if (pathSegments[0] === "announcements") {
      safeType = "announcements";
    } else if (pathSegments[0] === "tickets") {
      safeType = "tickets";
    } else if (pathSegments[0] === "registration-members") {
      safeType = "registration-members";
    } else if (pathSegments[0] === "registration-pets") {
      safeType = "registration-pets";
    }

    const fileName = pathSegments[pathSegments.length - 1];

    // Check if filename contains suspicious characters
    if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const publicRoot = path.join(process.cwd(), "public", "uploads", safeType);
    const fullPath = path.normalize(path.join(publicRoot, fileName));

    // Ensure the resolved path is strictly inside publicRoot
    if (!fullPath.startsWith(publicRoot)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    try {
      await stat(fullPath);
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const file = await readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    return new NextResponse(file, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(file.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to serve file" }, { status: 500 });
  }
}
