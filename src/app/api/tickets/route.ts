import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    let sql = `
      SELECT t.id, t.ticket_number, t.house_number, t.unit_number,
             t.problem_category, t.problem_title, t.problem_description,
             t.status, t.priority, t.reported_at, t.resolved_at,
             t.resolution_notes, t.assigned_to,
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

    return NextResponse.json({ tickets: result.rows.map((ticket: any) => ({ ...ticket, progress_logs: logsByTicket[ticket.id] || [] })), stats });
  } catch (err: any) {
    console.error("Tickets API error:", err);
    return NextResponse.json({ error: "Internal server error", details: err.message }, { status: 500 });
  }
}
