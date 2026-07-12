import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdminOrManager } from "@/lib/session";

export async function GET() {
  try {
    await requireAdminOrManager();

    const [householdsResult, membersResult, petsResult] = await Promise.all([
      query(
        `WITH household_member_counts AS (
           SELECT web_user_id, COUNT(*)::int AS member_count
           FROM slip_processing.household_members
           WHERE deleted_at IS NULL
           GROUP BY web_user_id
         ), household_pet_counts AS (
           SELECT web_user_id, COUNT(*)::int AS pet_count
           FROM slip_processing.household_pets
           WHERE deleted_at IS NULL
           GROUP BY web_user_id
         )
         SELECT
           wu.id AS web_user_id,
           COALESCE(NULLIF(wu.house_number, ''), 'ไม่ระบุบ้านเลขที่') AS house_number,
           COALESCE(NULLIF(wu.display_name, ''), wu.email, 'ไม่ระบุชื่อ') AS resident_name,
           wu.email,
           COALESCE(hmc.member_count, 0)::int AS member_count,
           COALESCE(hpc.pet_count, 0)::int AS pet_count,
           GREATEST(
             COALESCE(MAX(hm.updated_at), MAX(hm.created_at), wu.updated_at, wu.created_at),
             COALESCE(MAX(hp.updated_at), MAX(hp.created_at), wu.updated_at, wu.created_at)
           ) AS last_updated_at
         FROM slip_processing.web_users wu
         LEFT JOIN household_member_counts hmc ON hmc.web_user_id = wu.id
         LEFT JOIN household_pet_counts hpc ON hpc.web_user_id = wu.id
         LEFT JOIN slip_processing.household_members hm ON hm.web_user_id = wu.id AND hm.deleted_at IS NULL
         LEFT JOIN slip_processing.household_pets hp ON hp.web_user_id = wu.id AND hp.deleted_at IS NULL
         WHERE wu.deleted_at IS NULL
           AND (COALESCE(hmc.member_count, 0) > 0 OR COALESCE(hpc.pet_count, 0) > 0)
         GROUP BY wu.id, wu.house_number, wu.display_name, wu.email, wu.created_at, wu.updated_at, hmc.member_count, hpc.pet_count
         ORDER BY
           CASE WHEN COALESCE(NULLIF(wu.house_number, ''), '') = '' THEN 1 ELSE 0 END,
           NULLIF(regexp_replace(COALESCE(wu.house_number, ''), '[^0-9].*$', ''), '')::int NULLS LAST,
           wu.house_number NULLS LAST,
           resident_name`,
        []
      ),
      query(
        `SELECT
           hm.id,
           hm.web_user_id,
           COALESCE(NULLIF(hm.house_number, ''), NULLIF(wu.house_number, ''), 'ไม่ระบุบ้านเลขที่') AS house_number,
           COALESCE(NULLIF(wu.display_name, ''), wu.email, 'ไม่ระบุชื่อ') AS resident_name,
           hm.full_name,
           hm.relationship,
           hm.age,
           hm.image_path,
           hm.image_name,
           hm.image_size_bytes,
           hm.image_mime_type,
           hm.created_at,
           hm.updated_at
         FROM slip_processing.household_members hm
         JOIN slip_processing.web_users wu ON wu.id = hm.web_user_id AND wu.deleted_at IS NULL
         WHERE hm.deleted_at IS NULL
         ORDER BY
           CASE WHEN COALESCE(NULLIF(hm.house_number, ''), NULLIF(wu.house_number, ''), '') = '' THEN 1 ELSE 0 END,
           NULLIF(regexp_replace(COALESCE(NULLIF(hm.house_number, ''), NULLIF(wu.house_number, ''), ''), '[^0-9].*$', ''), '')::int NULLS LAST,
           COALESCE(NULLIF(hm.house_number, ''), NULLIF(wu.house_number, '')) NULLS LAST,
           hm.full_name`,
        []
      ),
      query(
        `SELECT
           hp.id,
           hp.web_user_id,
           COALESCE(NULLIF(hp.house_number, ''), NULLIF(wu.house_number, ''), 'ไม่ระบุบ้านเลขที่') AS house_number,
           COALESCE(NULLIF(wu.display_name, ''), wu.email, 'ไม่ระบุชื่อ') AS resident_name,
           hp.pet_name,
           hp.pet_type,
           hp.distinctive_features,
           hp.image_path,
           hp.image_name,
           hp.image_size_bytes,
           hp.image_mime_type,
           hp.created_at,
           hp.updated_at
         FROM slip_processing.household_pets hp
         JOIN slip_processing.web_users wu ON wu.id = hp.web_user_id AND wu.deleted_at IS NULL
         WHERE hp.deleted_at IS NULL
         ORDER BY
           CASE WHEN COALESCE(NULLIF(hp.house_number, ''), NULLIF(wu.house_number, ''), '') = '' THEN 1 ELSE 0 END,
           NULLIF(regexp_replace(COALESCE(NULLIF(hp.house_number, ''), NULLIF(wu.house_number, ''), ''), '[^0-9].*$', ''), '')::int NULLS LAST,
           COALESCE(NULLIF(hp.house_number, ''), NULLIF(wu.house_number, '')) NULLS LAST,
           hp.pet_name`,
        []
      ),
    ]);

    const totals = {
      households: householdsResult.rows.length,
      members: membersResult.rows.length,
      pets: petsResult.rows.length,
    };

    return NextResponse.json({
      success: true,
      totals,
      households: householdsResult.rows,
      members: membersResult.rows,
      pets: petsResult.rows,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load member and pet report" },
      { status: err.status || 500 }
    );
  }
}
