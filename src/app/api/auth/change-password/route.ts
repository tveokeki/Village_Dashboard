import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { currentPassword, newPassword } = await req.json();
    const userResult = await query("SELECT password_hash FROM slip_processing.web_users WHERE id = $1", [session.user.id]);
    if (userResult.rows.length === 0) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const valid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!valid) return NextResponse.json({ error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" }, { status: 400 });
    const newHash = await bcrypt.hash(newPassword, 12);
    await query("UPDATE slip_processing.web_users SET password_hash = $1 WHERE id = $2", [newHash, session.user.id]);
    return NextResponse.json({ success: true, message: "เปลี่ยนรหัสผ่านสำเร็จ" });
  } catch (err: any) {
    return NextResponse.json({ error: "เกิดข้อผิดพลาด" }, { status: 500 });
  }
}
