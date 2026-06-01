import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { access } from "fs/promises";
import path from "path";

async function fileExists(filePath: string | null) {
  if (!filePath || !filePath.startsWith("/")) return false;
  const publicRoot = path.join(process.cwd(), "public");
  const fullPath = path.normalize(path.join(publicRoot, filePath));
  if (!fullPath.startsWith(publicRoot)) return false;
  try {
    await access(fullPath);
    return true;
  } catch {
    return false;
  }
}

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
      SELECT id, title_th, title_en, category, file_name, file_path, file_size_bytes, mime_type, published_at
      FROM slip_processing.documents
      WHERE deleted_at IS NULL AND is_active = TRUE
      ORDER BY sort_order ASC, published_at DESC
      LIMIT 3
    `);

    const documentsWithAvailability = await Promise.all(
      documents.rows.map(async (doc) => ({
        ...doc,
        file_available: await fileExists(doc.file_path),
      }))
    );

    return NextResponse.json({ stats, announcements: announcements.rows, documents: documentsWithAvailability });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
