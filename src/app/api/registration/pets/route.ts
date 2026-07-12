import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { fileExistsUnderPublic, saveRegistrationImage } from "@/lib/registration-images";

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

async function currentHouseNumber(webUserId: string) {
  const result = await query(
    `SELECT house_number FROM slip_processing.web_users WHERE id = $1 AND deleted_at IS NULL`,
    [webUserId]
  );
  return result.rows[0]?.house_number || null;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const result = await query(
      `SELECT id, pet_name, pet_type, distinctive_features, house_number, image_path, image_name, image_size_bytes, image_mime_type, created_at, updated_at
       FROM slip_processing.household_pets
       WHERE web_user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [user.id]
    );

    const pets = await Promise.all(result.rows.map(async (pet: any) => ({
      ...pet,
      image_available: await fileExistsUnderPublic(pet.image_path),
    })));

    return NextResponse.json({ success: true, pets });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load pets" }, { status: err.status || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    const houseNumber = await currentHouseNumber(user.id);
    const result = await query(
      `INSERT INTO slip_processing.household_pets
       (id, web_user_id, house_number, pet_name, pet_type, distinctive_features, image_path, image_name, image_size_bytes, image_mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, pet_name, pet_type, distinctive_features, house_number, image_path, image_name, image_size_bytes, image_mime_type, created_at, updated_at`,
      [
        crypto.randomUUID(),
        user.id,
        houseNumber,
        petName,
        petType,
        distinctiveFeatures || null,
        upload?.image_path || null,
        upload?.image_name || null,
        upload?.image_size_bytes || null,
        upload?.image_mime_type || null,
      ]
    );

    return NextResponse.json({ success: true, pet: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to create pet" }, { status: err.status || 500 });
  }
}
