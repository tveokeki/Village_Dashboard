import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import bcrypt from "bcryptjs";
import crypto from "crypto";

function getOrigin(req: NextRequest) {
  return process.env.PUBLIC_ORIGIN || process.env.NEXTAUTH_URL || req.nextUrl.origin || "https://suan-ake.cloud";
}

function buildResetEmail(resetUrl: string) {
  const subject = "รีเซ็ตรหัสผ่าน / Reset your password - Suan Ake Lake Park Villa";
  const text = [
    "คุณได้ขอรีเซ็ตรหัสผ่านสำหรับเว็บไซต์นิติบุคคลหมู่บ้านจัดสรรสวนเอก เลคปาร์ควิลล่า",
    "กรุณาคลิกลิงก์ด้านล่างเพื่อตั้งรหัสผ่านใหม่ภายใน 1 ชั่วโมง:",
    resetUrl,
    "",
    "If you requested a password reset for Suan Ake Lake Park Villa, open the link above within 1 hour.",
    "If you did not request this, you can safely ignore this email.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;max-width:640px;margin:auto;padding:24px">
      <h2 style="color:#166534;margin-bottom:8px">รีเซ็ตรหัสผ่าน</h2>
      <p>คุณได้ขอรีเซ็ตรหัสผ่านสำหรับเว็บไซต์นิติบุคคลหมู่บ้านจัดสรรสวนเอก เลคปาร์ควิลล่า</p>
      <p>กรุณากดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่ภายใน <strong>1 ชั่วโมง</strong></p>
      <p style="margin:28px 0">
        <a href="${resetUrl}" style="background:#16a34a;color:white;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block">ตั้งรหัสผ่านใหม่</a>
      </p>
      <p style="font-size:13px;color:#6b7280">หากปุ่มใช้งานไม่ได้ ให้คัดลอกลิงก์นี้ไปเปิดใน browser:<br><a href="${resetUrl}">${resetUrl}</a></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
      <p>If you did not request this password reset, you can safely ignore this email.</p>
    </div>`;
  return { subject, text, html };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.token && body.newPassword) {
      const tokenHash = crypto.createHash("sha256").update(String(body.token)).digest("hex");
      const userResult = await query(
        "SELECT id FROM slip_processing.web_users WHERE reset_token = $1 AND reset_token_expires > NOW() AND deleted_at IS NULL",
        [tokenHash]
      );
      if (userResult.rows.length === 0) {
        return NextResponse.json({ error: "ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุ" }, { status: 400 });
      }
      const newHash = await bcrypt.hash(String(body.newPassword), 12);
      await query(
        "UPDATE slip_processing.web_users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL, updated_at = NOW() WHERE id = $2",
        [newHash, userResult.rows[0].id]
      );
      return NextResponse.json({ success: true, message: "ตั้งรหัสผ่านใหม่สำเร็จ" });
    }

    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return NextResponse.json({ success: true });

    const result = await query("SELECT id, email FROM slip_processing.web_users WHERE LOWER(email) = $1 AND deleted_at IS NULL", [email]);
    if (result.rows.length > 0) {
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      await query(
        "UPDATE slip_processing.web_users SET reset_token = $1, reset_token_expires = NOW() + INTERVAL '1 hour', updated_at = NOW() WHERE id = $2",
        [tokenHash, result.rows[0].id]
      );
      const resetUrl = `${getOrigin(req)}/reset-password?token=${encodeURIComponent(token)}`;
      const emailBody = buildResetEmail(resetUrl);
      try {
        const info = await sendMail({ to: result.rows[0].email, ...emailBody });
        console.log("password reset email sent", { accepted: info.accepted?.length || 0, rejected: info.rejected?.length || 0, response: info.response });
      } catch (mailErr: any) {
        console.error("password reset email failed", { message: mailErr.message, code: mailErr.code, command: mailErr.command });
      }
    }
    return NextResponse.json({ success: true, message: "ถ้าอีเมลมีอยู่ในระบบ จะได้รับลิงก์รีเซ็ต" });
  } catch (err: any) {
    console.error("reset-password error", { message: err.message });
    return NextResponse.json({ success: true });
  }
}
