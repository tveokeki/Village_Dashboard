import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { fileExistsUnderPublic, saveRegistrationImage } from "@/lib/registration-images";

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
      `SELECT id, full_name, relationship, age, house_number, image_path, image_name, image_size_bytes, image_mime_type, created_at, updated_at
       FROM slip_processing.household_members
       WHERE web_user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [user.id]
    );

    const members = await Promise.all(result.rows.map(async (member: any) => ({
      ...member,
      image_available: await fileExistsUnderPublic(member.image_path),
    })));

    return NextResponse.json({ success: true, members });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load household members" }, { status: err.status || 500 });
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

    const houseNumber = await currentHouseNumber(user.id);
    const result = await query(
      `INSERT INTO slip_processing.household_members
       (id, web_user_id, house_number, full_name, relationship, age, image_path, image_name, image_size_bytes, image_mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, full_name, relationship, age, house_number, image_path, image_name, image_size_bytes, image_mime_type, created_at, updated_at`,
      [
        crypto.randomUUID(),
        user.id,
        houseNumber,
        fullName,
        relationship,
        age,
        upload?.image_path || null,
        upload?.image_name || null,
        upload?.image_size_bytes || null,
        upload?.image_mime_type || null,
      ]
    );

    return NextResponse.json({ success: true, member: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to create household member" }, { status: err.status || 500 });
  }
}
