import { NextRequest, NextResponse } from "next/server";
import { readFile, stat, mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { query } from "@/lib/db";
import { requireFinanceAccess } from "@/lib/finance-auth";

const mimeFallback: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxImageSize = 8 * 1024 * 1024; // 8MB

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // 1. Require finance-level authentication
    await requireFinanceAccess();

    const { searchParams } = req.url ? new URL(req.url) : req.nextUrl;
    const paymentId = searchParams.get("id")?.trim();
    if (!paymentId) {
      return NextResponse.json({ error: "id parameter is required" }, { status: 400 });
    }

    // 2. Query the payment slip file system path associated with the payment id
    const r = await query(
      `SELECT psf.file_system_path, psf.mime_type
       FROM slip_processing.payments p
       JOIN slip_processing.payment_slip_files psf 
         ON psf.payment_slip_id::text = substring(p.notes from '"payment_slip_id":\\s*"([^"]+)"')
         AND psf.file_role = 'original'
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [paymentId]
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

export async function POST(req: NextRequest) {
  try {
    // 1. Require finance-level authentication
    const user = await requireFinanceAccess();

    // 2. Parse request formData
    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // 3. Validate image type and size
    if (!allowedImageTypes.has(file.type)) {
      return NextResponse.json({ error: "Unsupported image type. Please upload JPG, PNG, WEBP, or GIF." }, { status: 400 });
    }

    if (file.size > maxImageSize) {
      return NextResponse.json({ error: "Image is too large (max 8MB)." }, { status: 400 });
    }

    // 4. Save file to disk
    const extByType: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
    };
    const ext = extByType[file.type] || path.extname(file.name || "") || ".jpg";
    const dir = "/var/lib/payment-slips/uploads";
    await mkdir(dir, { recursive: true });

    const diskName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    const fullPath = path.join(dir, diskName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(fullPath, buffer);

    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const paymentSlipId = crypto.randomUUID();

    // 5. Query user_id from web_users to satisfy foreign key constraint in payment_slips
    const userRes = await query("SELECT user_id FROM slip_processing.web_users WHERE id = $1", [user.id]);
    const coreUserId = userRes.rows[0]?.user_id || null;

    if (!coreUserId) {
      return NextResponse.json({ error: "Authenticated core user not found" }, { status: 401 });
    }

    // 6. Insert skeleton record into payment_slips first
    await query(
      `INSERT INTO slip_processing.payment_slips (
         id, user_id, amount, currency_code, payment_type, source_channel, file_system_path, processing_status
       ) VALUES ($1, $2, 0, 'THB', 'unknown', 'web', $3, 'verified')`,
      [paymentSlipId, coreUserId, fullPath]
    );

    // 7. Insert file record into payment_slip_files (safely referencing the payment_slips row)
    await query(
      `INSERT INTO slip_processing.payment_slip_files (id, payment_slip_id, file_role, file_system_path, mime_type, file_size_bytes, sha256)
       VALUES ($1, $2, 'original', $3, $4, $5, $6)`,
      [crypto.randomUUID(), paymentSlipId, fullPath, file.type, file.size, sha256]
    );

    return NextResponse.json({
      success: true,
      payment_slip_id: paymentSlipId,
      file_name: file.name || diskName,
    });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: err.status || 500 }
    );
  }
}
