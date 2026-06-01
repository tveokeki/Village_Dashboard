import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    // Ticket stats
    const ticketStats = await query(`
      SELECT status, COUNT(*) as count
      FROM slip_processing.problem_tickets
      WHERE deleted_at IS NULL
      GROUP BY status
    `);
    const stats: Record<string, number> = { received: 0, in_progress: 0, resolved: 0, closed: 0 };
    ticketStats.rows.forEach((r: any) => { stats[r.status] = parseInt(r.count); });

    // Latest announcements
    const announcements = await query(`
      SELECT id, title_th, title_en, published_at
      FROM slip_processing.announcements
      WHERE deleted_at IS NULL AND is_published = TRUE
      ORDER BY is_pinned DESC, published_at DESC
      LIMIT 3
    `);

    // Latest documents
    const documents = await query(`
      SELECT id, title_th, title_en, category, file_name, file_size_bytes, published_at
      FROM slip_processing.documents
      WHERE deleted_at IS NULL AND is_active = TRUE
      ORDER BY published_at DESC
      LIMIT 3
    `);

    return NextResponse.json({ stats, announcements: announcements.rows, documents: documents.rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
