import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

const allowedStatuses = new Set(["received", "in_progress", "resolved", "closed", "cancelled"]);
const allowedPriorities = new Set(["low", "medium", "high", "urgent"]);

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const { searchParams } = req.nextUrl;
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const q = searchParams.get("q");
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 200);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const params: any[] = [];
    let sql = `
      SELECT t.id, t.ticket_number, t.user_id, t.house_number, t.unit_number,
             t.problem_category, t.problem_title, t.problem_description,
             t.status, t.priority, t.reported_at, t.resolved_at,
             t.resolution_notes, t.assigned_to, t.line_message_id,
             t.created_at, t.updated_at, u.display_name AS reporter_name
      FROM slip_processing.problem_tickets t
      LEFT JOIN slip_processing.users u ON t.user_id = u.id
      WHERE t.deleted_at IS NULL
    `;
    if (status && status !== "all") {
      params.push(status);
      sql += ` AND t.status = $${params.length}`;
    }
    if (priority && priority !== "all") {
      params.push(priority);
      sql += ` AND t.priority = $${params.length}`;
    }
    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      sql += ` AND (t.ticket_number ILIKE $${params.length} OR t.house_number ILIKE $${params.length} OR t.problem_title ILIKE $${params.length} OR t.problem_description ILIKE $${params.length})`;
    }
    sql += ` ORDER BY t.reported_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const [tickets, stats] = await Promise.all([
      query(sql, params),
      query(`SELECT status, COUNT(*)::int AS count FROM slip_processing.problem_tickets WHERE deleted_at IS NULL GROUP BY status`),
    ]);

    const ids = tickets.rows.map((t: any) => t.id);
    let logsByTicket: Record<string, any[]> = {};
    if (ids.length) {
      const logs = await query(
        `SELECT id, ticket_id, status, priority, assigned_to, note, created_by, created_by_name, created_at, edited_at, edited_by_name
         FROM slip_processing.ticket_progress_logs
         WHERE ticket_id = ANY($1::uuid[]) AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [ids]
      );
      logsByTicket = logs.rows.reduce((acc: Record<string, any[]>, row: any) => {
        const decorated = { ...row, can_edit: Boolean(row.created_by && admin.id && row.created_by === admin.id) };
        (acc[row.ticket_id] ||= []).push(decorated);
        return acc;
      }, {});
    }

    return NextResponse.json({ tickets: tickets.rows.map((ticket: any) => ({ ...ticket, progress_logs: logsByTicket[ticket.id] || [] })), stats: stats.rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
