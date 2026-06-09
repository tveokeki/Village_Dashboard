import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { query } from "@/lib/db";
import { requireFinanceAccess } from "@/lib/finance-auth";

const mimeFallback: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // 1. Require finance-level authentication
    await requireFinanceAccess();

    const { searchParams } = req.nextUrl;
    const slipId = searchParams.get("id")?.trim();
    if (!slipId) {
      return NextResponse.json({ error: "id parameter is required" }, { status: 400 });
    }

    // 2. Query payment slip file path directly from payment_slips and payment_slip_files (hybrid)
    const r = await query(
      `SELECT COALESCE(ps.file_system_path, psf.file_system_path) AS file_system_path,
              COALESCE(psf.mime_type, 'image/jpeg') AS mime_type
       FROM slip_processing.payment_slips ps
       LEFT JOIN slip_processing.payment_slip_files psf 
         ON psf.payment_slip_id = ps.id AND psf.file_role = 'original'
       WHERE ps.id::text = $1 AND ps.deleted_at IS NULL`,
      [slipId]
    );

    if (r.rows.length === 0 || !r.rows[0].file_system_path) {
      return NextResponse.json({ error: "Slip file not found" }, { status: 404 });
    }

    let fullPath = String(r.rows[0].file_system_path);
    if (!fullPath.startsWith("/")) {
      fullPath = path.join("/var/lib/payment-slips", fullPath);
    }

    // 3. Verify file existence and is a file
    try {
      const s = await stat(fullPath);
      if (!s.isFile()) {
        return NextResponse.json({ error: `Slip file is not a valid file: ${fullPath}` }, { status: 404 });
      }
    } catch {
      return NextResponse.json({ error: `Slip file cannot be found on disk: ${fullPath}` }, { status: 404 });
    }

    // 4. Read the file binary and serve it
    const bytes = await readFile(fullPath);
    const contentType = r.rows[0].mime_type || mimeFallback[path.extname(fullPath).toLowerCase()] || "image/jpeg";

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: err.status || 500 }
    );
  }
}
