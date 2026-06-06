import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile, stat } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

const allowedPriorities = new Set(["low", "medium", "high", "urgent"]);
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxImageSize = 8 * 1024 * 1024;

function safeText(value: FormDataEntryValue | null, max = 500) {
  return String(value || "").trim().slice(0, max);
}

async function fileExistsUnderPublic(filePath?: string | null) {
  if (!filePath || !filePath.startsWith("/uploads/")) return false;
  const publicRoot = path.join(process.cwd(), "public");
  const fullPath = path.normalize(path.join(publicRoot, filePath));
  if (!fullPath.startsWith(publicRoot)) return false;
  try {
    const s = await stat(fullPath);
    return s.isFile();
  } catch {
    return false;
  }
}

async function saveTicketImage(file: File | null) {
  if (!file || file.size === 0) return null;
  if (!allowedImageTypes.has(file.type)) {
    const err: any = new Error("Unsupported image type. Please upload JPG, PNG, WEBP, or GIF.");
    err.status = 400;
    throw err;
  }
  if (file.size > maxImageSize) {
    const err: any = new Error("Image is too large (max 8MB).");
    err.status = 400;
    throw err;
  }
  const extByType: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  const ext = extByType[file.type] || path.extname(file.name || "") || ".img";
  const dir = path.join(process.cwd(), "public", "uploads", "tickets");
  await mkdir(dir, { recursive: true });
  const diskName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
  const diskPath = path.join(dir, diskName);
  await writeFile(diskPath, Buffer.from(await file.arrayBuffer()));
  return {
    image_path: `/uploads/tickets/${diskName}`,
    image_name: file.name || diskName,
    image_size_bytes: file.size,
    image_mime_type: file.type,
  };
}

async function decorateTickets(rows: any[]) {
  return Promise.all(rows.map(async (ticket: any) => ({
    ...ticket,
    image_available: await fileExistsUnderPublic(ticket.image_path),
  })));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const q = searchParams.get("q");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    let sql = `
      SELECT t.id, t.ticket_number, t.house_number, t.unit_number,
             t.problem_category, t.problem_title, t.problem_description,
             t.status, t.priority, t.reported_at, t.resolved_at,
             t.resolution_notes, t.assigned_to,
             t.image_path, t.image_name, t.image_size_bytes, t.image_mime_type,
             u.display_name as reporter_name
      FROM slip_processing.problem_tickets t
      LEFT JOIN slip_processing.users u ON t.user_id = u.id
      WHERE t.deleted_at IS NULL
    `;
    const params: any[] = [];

    if (status && status !== "all") {
      sql += " AND t.status = $" + (params.length + 1);
      params.push(status);
    }

    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      sql += ` AND (
        t.ticket_number ILIKE $${params.length}
        OR t.house_number ILIKE $${params.length}
        OR t.problem_description ILIKE $${params.length}
        OR t.problem_title ILIKE $${params.length}
      )`;
    }

    sql += " ORDER BY t.reported_at DESC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
    params.push(limit, offset);

    const result = await query(sql, params);

    const ids = result.rows.map((t: any) => t.id);
    let logsByTicket: Record<string, any[]> = {};
    if (ids.length) {
      const logs = await query(
        `SELECT id, ticket_id, status, priority, assigned_to, note, created_by_name, created_at, edited_at, edited_by_name
         FROM slip_processing.ticket_progress_logs
         WHERE ticket_id = ANY($1::uuid[]) AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [ids]
      );
      logsByTicket = logs.rows.reduce((acc: Record<string, any[]>, row: any) => {
        (acc[row.ticket_id] ||= []).push(row);
        return acc;
      }, {});
    }

    // Get stats
    const statsResult = await query(`
      SELECT status, COUNT(*) as count
      FROM slip_processing.problem_tickets
      WHERE deleted_at IS NULL
      GROUP BY status
    `);

    const stats: Record<string, number> = {};
    statsResult.rows.forEach((r: any) => { stats[r.status] = parseInt(r.count); });

    const tickets = await decorateTickets(result.rows);
    return NextResponse.json({ tickets: tickets.map((ticket: any) => ({ ...ticket, progress_logs: logsByTicket[ticket.id] || [] })), stats });
  } catch (err: any) {
    console.error("Tickets API error:", err);
    return NextResponse.json({ error: "Internal server error", details: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const form = await req.formData();
    const problemTitle = safeText(form.get("problem_title"), 200);
    const problemDescription = safeText(form.get("problem_description"), 4000);
    const problemCategory = safeText(form.get("problem_category"), 80) || "other";
    const priority = safeText(form.get("priority"), 20) || "medium";
    const houseNumber = safeText(form.get("house_number"), 80) || null;
    const unitNumber = safeText(form.get("unit_number"), 80) || null;
    const image = form.get("image") as File | null;

    if (!problemTitle) return NextResponse.json({ error: "Problem title is required" }, { status: 400 });
    if (!problemDescription) return NextResponse.json({ error: "Problem description is required" }, { status: 400 });
    if (!allowedPriorities.has(priority)) return NextResponse.json({ error: "Invalid priority" }, { status: 400 });

    const upload = await saveTicketImage(image);

    let residentUserId = user.linkedUserId || null;
    if (!residentUserId) {
      const syntheticLineId = `web:${user.id}`;
      const displayName = user.name || user.email || "Web user";
      const username = user.email || syntheticLineId;
      const resident = await query(
        `INSERT INTO slip_processing.users (line_user_id, username, display_name, language_code, metadata)
         VALUES ($1, $2, $3, 'th', jsonb_build_object('source', 'web_portal', 'web_user_id', $4::text))
         ON CONFLICT (line_user_id) DO UPDATE SET display_name=EXCLUDED.display_name, updated_at=NOW()
         RETURNING id`,
        [syntheticLineId, username, displayName, user.id]
      );
      residentUserId = resident.rows[0].id;
      await query("UPDATE slip_processing.web_users SET user_id=$2, updated_at=NOW() WHERE id=$1 AND user_id IS NULL", [user.id, residentUserId]);
    }

    const ticketResult = await query(
      `INSERT INTO slip_processing.problem_tickets (
         user_id, house_number, unit_number, problem_category, problem_title, problem_description,
         status, priority, image_path, image_name, image_size_bytes, image_mime_type
       ) VALUES ($1,$2,$3,$4,$5,$6,'received',$7,$8,$9,$10,$11)
       RETURNING id, ticket_number, user_id, house_number, unit_number, problem_category, problem_title, problem_description,
                 status, priority, reported_at, resolved_at, resolution_notes, assigned_to,
                 image_path, image_name, image_size_bytes, image_mime_type`,
      [
        residentUserId,
        houseNumber,
        unitNumber,
        problemCategory,
        problemTitle,
        problemDescription,
        priority,
        upload?.image_path || null,
        upload?.image_name || null,
        upload?.image_size_bytes || null,
        upload?.image_mime_type || null,
      ]
    );
    const ticket = ticketResult.rows[0];

    await query(
      `INSERT INTO slip_processing.problem_ticket_updates (ticket_id, update_type, new_status, message, updated_by, created_at)
       VALUES ($1, 'status_change', 'received', 'Ticket created from web portal', 'user', NOW())`,
      [ticket.id]
    );
    await query(
      `INSERT INTO slip_processing.ticket_progress_logs (id, ticket_id, status, priority, note, created_by, created_by_name, created_at)
       VALUES ($1,$2,'received',$3,$4,$5,$6,NOW())`,
      [crypto.randomUUID(), ticket.id, ticket.priority, upload ? "สร้างรายการปัญหาพร้อมแนบรูปภาพ" : "สร้างรายการปัญหา", residentUserId, user.name || user.email || "Web user"]
    );

    const [decorated] = await decorateTickets([ticket]);
    return NextResponse.json({ success: true, ticket: decorated }, { status: 201 });
  } catch (err: any) {
    console.error("Create ticket API error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: err.status || 500 });
  }
}
