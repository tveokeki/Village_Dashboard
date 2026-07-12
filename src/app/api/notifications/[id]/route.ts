import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdminOrManager } from "@/lib/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOrManager();
    const { id } = await params;
    const body = await req.json();
    await query(
      `UPDATE slip_processing.notifications
       SET user_id=$2, title_th=$3, title_en=$4, message_th=$5, message_en=$6, type=$7, target_url=$8
       WHERE id=$1`,
      [
        id,
        body.user_id || null,
        body.title_th,
        body.title_en || null,
        body.message_th,
        body.message_en || null,
        body.type || "general",
        body.target_url || null,
      ]
    );
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
