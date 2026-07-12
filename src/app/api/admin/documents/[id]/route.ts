import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdminOrManager } from "@/lib/session";
import { autoTranslateDocumentEnglish } from "@/lib/sharon-translation";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOrManager();
    const { id } = await params;
    const body = await autoTranslateDocumentEnglish(await req.json());
    await query(
      `UPDATE slip_processing.documents
       SET title_th=$2, title_en=$3, description_th=$4, description_en=$5, category=$6,
           file_name=$7, file_path=$8, file_size_bytes=$9, mime_type=$10, is_active=$11, sort_order=$12, updated_at=NOW()
       WHERE id=$1 AND deleted_at IS NULL`,
      [id, body.title_th, body.title_en || null, body.description_th || null, body.description_en || null, body.category || "rules", body.file_name || null, body.file_path || null, Number(body.file_size_bytes || 0), body.mime_type || null, body.is_active !== false, Number(body.sort_order || 0)]
    );
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOrManager();
    const { id } = await params;
    await query("UPDATE slip_processing.documents SET deleted_at = NOW(), updated_at = NOW() WHERE id=$1", [id]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
