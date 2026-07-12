import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { saveRegistrationImage } from "@/lib/registration-images";

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeAge(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const age = Number(value);
  if (!Number.isInteger(age) || age < 0 || age > 120) {
    const err: any = new Error("Invalid age");
    err.status = 400;
    throw err;
  }
  return age;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const contentType = req.headers.get("content-type") || "";
    let body: any;
    let upload = null;
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      body = {
        full_name: formData.get("full_name"),
        relationship: formData.get("relationship"),
        age: formData.get("age"),
      };
      upload = await saveRegistrationImage(formData.get("image") as File | null, "registration-members");
    } else {
      body = await req.json();
    }
    const fullName = text(body.full_name, 200);
    const relationship = text(body.relationship, 120);
    const age = normalizeAge(body.age);

    if (!fullName) return NextResponse.json({ error: "Full name is required" }, { status: 400 });
    if (!relationship) return NextResponse.json({ error: "Relationship is required" }, { status: 400 });

    const result = await query(
      `UPDATE slip_processing.household_members
       SET full_name = $3,
           relationship = $4,
           age = $5,
           image_path = COALESCE($6, image_path),
           image_name = COALESCE($7, image_name),
           image_size_bytes = COALESCE($8, image_size_bytes),
           image_mime_type = COALESCE($9, image_mime_type),
           updated_at = NOW()
       WHERE id = $1 AND web_user_id = $2 AND deleted_at IS NULL
       RETURNING id, full_name, relationship, age, house_number, image_path, image_name, image_size_bytes, image_mime_type, created_at, updated_at`,
      [
        id,
        user.id,
        fullName,
        relationship,
        age,
        upload?.image_path || null,
        upload?.image_name || null,
        upload?.image_size_bytes || null,
        upload?.image_mime_type || null,
      ]
    );

    if (!result.rows[0]) return NextResponse.json({ error: "Household member not found" }, { status: 404 });
    return NextResponse.json({ success: true, member: result.rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update household member" }, { status: err.status || 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const result = await query(
      `UPDATE slip_processing.household_members
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND web_user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, user.id]
    );

    if (!result.rows[0]) return NextResponse.json({ error: "Household member not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete household member" }, { status: err.status || 500 });
  }
}
