import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdminOrManager } from "@/lib/session";
import { notifyLineResolvedConfirmation, notifyLineTicketUpdate, notifyLineTicketUpdateToManagers, type LinePushResult } from "@/lib/line-ticket-notifications";
import crypto from "crypto";

const allowedStatuses = new Set(["received", "in_progress", "resolved", "closed", "cancelled"]);
const allowedPriorities = new Set(["low", "medium", "high", "urgent"]);

function statusLabelTh(status: string) {
  return ({ received: "รับเรื่องแล้ว", in_progress: "กำลังดำเนินการ", resolved: "แก้ไขแล้ว", closed: "ปิดงานแล้ว", cancelled: "ยกเลิก" } as Record<string, string>)[status] || status;
}

function statusLabelEn(status: string) {
  return ({ received: "Received", in_progress: "In progress", resolved: "Resolved", closed: "Closed", cancelled: "Cancelled" } as Record<string, string>)[status] || status;
}

async function getLogs(ticketId: string, adminId: string) {
  const logs = await query(
    `SELECT id, ticket_id, status, priority, assigned_to, note, created_by, created_by_name, created_at, edited_at, edited_by_name
     FROM slip_processing.ticket_progress_logs
     WHERE ticket_id=$1 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [ticketId]
  );
  return logs.rows.map((row: any) => ({ ...row, can_edit: Boolean(row.created_by && adminId && row.created_by === adminId) }));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminOrManager();
    const { id } = await params;
    const body = await req.json();

    const current = await query(
      `SELECT t.id, t.ticket_number, t.user_id, t.status, t.priority, t.assigned_to, t.problem_title,
              u.line_user_id, u.language_code
       FROM slip_processing.problem_tickets t
       LEFT JOIN slip_processing.users u ON u.id = t.user_id
       WHERE t.id=$1 AND t.deleted_at IS NULL`,
      [id]
    );
    if (current.rows.length === 0) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    const before = current.rows[0];

    const status = body.status || before.status;
    const priority = body.priority || before.priority;
    const assignedTo = body.assigned_to ?? before.assigned_to;
    const progressNote = String(body.progress_note || "").trim();
    if (!allowedStatuses.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    if (priority && !allowedPriorities.has(priority)) return NextResponse.json({ error: "Invalid priority" }, { status: 400 });

    const statusChanged = before.status !== status;
    const priorityChanged = before.priority !== priority;
    const assignedChanged = (before.assigned_to || "") !== (assignedTo || "");
    if (!statusChanged && !priorityChanged && !assignedChanged && !progressNote) {
      return NextResponse.json({ error: "No changes to save" }, { status: 400 });
    }

    const fallbackNote = [
      statusChanged ? `Status: ${before.status} → ${status}` : null,
      priorityChanged ? `Priority: ${before.priority} → ${priority}` : null,
      assignedChanged ? `Assigned: ${before.assigned_to || "-"} → ${assignedTo || "-"}` : null,
    ].filter(Boolean).join("; ");
    const logNote = progressNote || fallbackNote || "Ticket updated";

    const resolvedAtSql = ["resolved", "closed"].includes(status) ? "COALESCE(resolved_at, NOW())" : "NULL";
    const result = await query(
      `UPDATE slip_processing.problem_tickets
       SET status=$2,
           priority=$3,
           assigned_to=$4,
           resolution_notes=$5,
           resolved_at=${resolvedAtSql},
           updated_at=NOW()
       WHERE id=$1 AND deleted_at IS NULL
       RETURNING id, ticket_number, user_id, house_number, problem_title, status, priority, assigned_to, resolution_notes, resolved_at, updated_at`,
      [id, status, priority, assignedTo || null, logNote]
    );

    const ticket = result.rows[0];
    await query(
      `INSERT INTO slip_processing.ticket_progress_logs (id, ticket_id, status, priority, assigned_to, note, created_by, created_by_name, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [crypto.randomUUID(), ticket.id, ticket.status, ticket.priority, ticket.assigned_to || null, logNote, admin.id || null, admin.name || admin.email || "Admin"]
    );

    let notificationId: string | null = null;
    if (statusChanged || progressNote) {
      notificationId = crypto.randomUUID();
      await query(
        `INSERT INTO slip_processing.notifications (id, user_id, title_th, title_en, message_th, message_en, type, target_url, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,'ticket',$7,NOW())`,
        [
          notificationId,
          ticket.user_id,
          `อัปเดต Ticket ${ticket.ticket_number}`,
          `Ticket ${ticket.ticket_number} updated`,
          `รายการ "${ticket.problem_title}" ${statusChanged ? `เปลี่ยนสถานะเป็น ${statusLabelTh(ticket.status)}` : "มีบันทึกความคืบหน้าใหม่"}`,
          `"${ticket.problem_title}" ${statusChanged ? `is now ${statusLabelEn(ticket.status)}` : "has a new progress update"}`,
          `/tickets?ticket=${encodeURIComponent(ticket.ticket_number)}`,
        ]
      );
    }

    let lineConfirmation: LinePushResult | null = null;
    let lineNotification: LinePushResult | null = null;
    if (statusChanged && status === "resolved") {
      lineConfirmation = await notifyLineResolvedConfirmation(
        ticket,
        { line_user_id: before.line_user_id, language_code: before.language_code },
      );
      lineNotification = lineConfirmation;

      // Notify all managers
      await notifyLineTicketUpdateToManagers(ticket, { isResolved: true, skipLineUserId: before.line_user_id });
    } else if (statusChanged || progressNote) {
      lineNotification = await notifyLineTicketUpdate(
        ticket,
        { line_user_id: before.line_user_id, language_code: before.language_code },
        { statusChanged, progressNote, oldStatus: before.status, newStatus: status },
      );

      // Notify all managers
      await notifyLineTicketUpdateToManagers(ticket, { statusChanged, progressNote, oldStatus: before.status, newStatus: status, skipLineUserId: before.line_user_id });
    }

    if (notificationId && lineNotification?.sent) {
      await query("UPDATE slip_processing.notifications SET sent_line=TRUE WHERE id=$1", [notificationId]);
    }

    return NextResponse.json({ success: true, message: "Ticket updated successfully", ticket: { ...ticket, progress_logs: await getLogs(ticket.id, admin.id) }, line_confirmation: lineConfirmation, line_notification: lineNotification });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminOrManager();
    const { id } = await params;
    await query("UPDATE slip_processing.problem_tickets SET deleted_at=NOW(), updated_at=NOW() WHERE id=$1", [id]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
