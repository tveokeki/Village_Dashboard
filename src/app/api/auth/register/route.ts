import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { query } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fullName, email, password, confirmPassword, houseNumber, lineId } = body;

    if (!fullName || !email || !password) {
      return NextResponse.json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" }, { status: 400 });
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ error: "รหัสผ่านไม่ตรงกัน" }, { status: 400 });
    }

    // Check existing
    const existing = await query("SELECT id FROM slip_processing.web_users WHERE email = $1 AND deleted_at IS NULL", [email]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "อีเมลนี้ถูกใช้งานแล้ว" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const id = uuidv4();

    await query(
      `INSERT INTO slip_processing.web_users (id, email, password_hash, display_name, house_number, line_id, role, preferred_language)
       VALUES ($1, $2, $3, $4, $5, $6, 'resident', 'th')`,
      [id, email, passwordHash, fullName, houseNumber || null, lineId || null]
    );

    return NextResponse.json({ success: true, message: "สมัครสมาชิกสำเร็จ" });
  } catch (err: any) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดภายในระบบ" }, { status: 500 });
  }
}
