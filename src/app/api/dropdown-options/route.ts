import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const groupsParam = searchParams.get("groups");
    const groups = groupsParam
      ? groupsParam.split(",").map((g) => g.trim()).filter(Boolean)
      : [];

    const params: any[] = [];
    let sql = `
      SELECT group_key, option_code, label_th, label_en, icon, color_class, sort_order
      FROM slip_processing.dropdown_options
      WHERE deleted_at IS NULL AND is_active = TRUE
    `;

    if (groups.length > 0) {
      params.push(groups);
      sql += ` AND group_key = ANY($1::text[])`;
    }

    sql += ` ORDER BY group_key, sort_order, option_code`;
    const result = await query(sql, params);

    const groupsMap = result.rows.reduce((acc: Record<string, any[]>, row: any) => {
      (acc[row.group_key] ||= []).push({
        code: row.option_code,
        label_th: row.label_th,
        label_en: row.label_en,
        icon: row.icon,
        color_class: row.color_class,
        sort_order: row.sort_order,
      });
      return acc;
    }, {});

    return NextResponse.json({ groups: groupsMap, options: result.rows });
  } catch (err: any) {
    console.error("Dropdown options API error:", err);
    return NextResponse.json({ error: err.message || "Failed to load dropdown options" }, { status: 500 });
  }
}
