import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { saveRegistrationImage } from "@/lib/registration-images";

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
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
        pet_name: formData.get("pet_name"),
        pet_type: formData.get("pet_type"),
        distinctive_features: formData.get("distinctive_features"),
      };
      upload = await saveRegistrationImage(formData.get("image") as File | null, "registration-pets");
    } else {
      body = await req.json();
    }
    const petName = text(body.pet_name, 160);
    const petType = text(body.pet_type, 120);
    const distinctiveFeatures = text(body.distinctive_features, 1200);

    if (!petName) return NextResponse.json({ error: "Pet name is required" }, { status: 400 });
    if (!petType) return NextResponse.json({ error: "Pet type is required" }, { status: 400 });

    const result = await query(
      `UPDATE slip_processing.household_pets
       SET pet_name = $3,
           pet_type = $4,
           distinctive_features = $5,
           image_path = COALESCE($6, image_path),
           image_name = COALESCE($7, image_name),
           image_size_bytes = COALESCE($8, image_size_bytes),
           image_mime_type = COALESCE($9, image_mime_type),
           updated_at = NOW()
       WHERE id = $1 AND web_user_id = $2 AND deleted_at IS NULL
       RETURNING id, pet_name, pet_type, distinctive_features, house_number, image_path, image_name, image_size_bytes, image_mime_type, created_at, updated_at`,
      [
        id,
        user.id,
        petName,
        petType,
        distinctiveFeatures || null,
        upload?.image_path || null,
        upload?.image_name || null,
        upload?.image_size_bytes || null,
        upload?.image_mime_type || null,
      ]
    );

    if (!result.rows[0]) return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    return NextResponse.json({ success: true, pet: result.rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update pet" }, { status: err.status || 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const result = await query(
      `UPDATE slip_processing.household_pets
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND web_user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, user.id]
    );

    if (!result.rows[0]) return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete pet" }, { status: err.status || 500 });
  }
}
