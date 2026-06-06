import crypto from "crypto";
import { query } from "@/lib/db";

type TicketForLine = {
  id: string;
  ticket_number: string;
  problem_title: string;
  house_number?: string | null;
  unit_number?: string | null;
  resolution_notes?: string | null;
};

type ReporterForLine = {
  line_user_id?: string | null;
  language_code?: string | null;
};

export type LinePushResult = {
  attempted: boolean;
  sent: boolean;
  requestId?: string;
  reason?: string;
};

type GenericTicketUpdateOptions = {
  statusChanged?: boolean;
  progressNote?: string;
  oldStatus?: string;
  newStatus?: string;
};

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

function getLineToken() {
  return (
    process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ||
    process.env.LINE_CHANNEL_ACCESS_TOKEN ||
    ""
  ).trim();
}

function compactAddress(ticket: TicketForLine) {
  return [ticket.house_number, ticket.unit_number ? `ยูนิต ${ticket.unit_number}` : null]
    .filter(Boolean)
    .join(" / ");
}

function statusLabel(status: string | undefined, lang: string) {
  const labels = {
    th: { received: "รับเรื่องแล้ว", in_progress: "กำลังดำเนินการ", resolved: "แก้ไขแล้ว", closed: "ปิดงานแล้ว", cancelled: "ยกเลิก" },
    en: { received: "Received", in_progress: "In progress", resolved: "Resolved", closed: "Closed", cancelled: "Cancelled" },
  } as Record<string, Record<string, string>>;
  return labels[lang]?.[status || ""] || status || "-";
}

function publicOrigin() {
  return (process.env.PUBLIC_ORIGIN || process.env.NEXTAUTH_URL || "https://suan-ake.cloud").replace(/\/$/, "");
}

export function ticketDetailUrl(ticket: TicketForLine) {
  const origin = publicOrigin();
  const basePath = (process.env.NEXT_PUBLIC_UAT_BASE_PATH || "").replace(/\/$/, "");
  const pathPrefix = basePath && !origin.endsWith(basePath) ? basePath : "";
  const ticketParam = encodeURIComponent(ticket.ticket_number || ticket.id);
  return `${origin}${pathPrefix}/tickets?ticket=${ticketParam}`;
}

function buildResolvedMessage(ticket: TicketForLine, lang: string) {
  const address = compactAddress(ticket);
  if (lang === "en") {
    return [
      `✅ Ticket ${ticket.ticket_number} has been marked as resolved.`,
      `Issue: ${ticket.problem_title}`,
      address ? `House/Unit: ${address}` : null,
      ticket.resolution_notes ? `Note: ${ticket.resolution_notes}` : null,
      `Details: ${ticketDetailUrl(ticket)}`,
      "Please confirm whether the issue has truly been fixed.",
    ].filter(Boolean).join("\n");
  }

  return [
    `✅ ปัญหา Ticket ${ticket.ticket_number} ถูกระบุว่าแก้ไขแล้ว`,
    `เรื่อง: ${ticket.problem_title}`,
    address ? `บ้าน/ยูนิต: ${address}` : null,
    ticket.resolution_notes ? `หมายเหตุ: ${ticket.resolution_notes}` : null,
    `ดูรายละเอียด: ${ticketDetailUrl(ticket)}`,
    "กรุณายืนยันว่าปัญหาได้รับการแก้ไขแล้วจริงหรือไม่ครับ/ค่ะ",
  ].filter(Boolean).join("\n");
}

function buildGenericUpdateMessage(ticket: TicketForLine, lang: string, options: GenericTicketUpdateOptions) {
  const address = compactAddress(ticket);
  const note = (options.progressNote || "").trim();
  if (lang === "en") {
    return [
      `🔔 Ticket ${ticket.ticket_number} has been updated.`,
      `Issue: ${ticket.problem_title}`,
      address ? `House/Unit: ${address}` : null,
      options.statusChanged ? `Status: ${statusLabel(options.oldStatus, lang)} → ${statusLabel(options.newStatus, lang)}` : null,
      note ? `Progress note: ${note}` : null,
      `Details: ${ticketDetailUrl(ticket)}`,
    ].filter(Boolean).join("\n");
  }

  return [
    `🔔 มีการอัปเดต Ticket ${ticket.ticket_number}`,
    `เรื่อง: ${ticket.problem_title}`,
    address ? `บ้าน/ยูนิต: ${address}` : null,
    options.statusChanged ? `สถานะ: ${statusLabel(options.oldStatus, lang)} → ${statusLabel(options.newStatus, lang)}` : null,
    note ? `บันทึกความคืบหน้า: ${note}` : null,
    `ดูรายละเอียด: ${ticketDetailUrl(ticket)}`,
  ].filter(Boolean).join("\n");
}

async function pushLineText(lineUserId: string, token: string, text: string, quickReply?: unknown): Promise<{ ok: boolean; errorText?: string; status?: number }> {
  const message: Record<string, unknown> = { type: "text", text };
  if (quickReply) message.quickReply = quickReply;

  const res = await fetch(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: lineUserId, messages: [message] }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    return { ok: false, status: res.status, errorText };
  }
  return { ok: true };
}

function buildQuickReply(ticketId: string, requestId: string, lang: string) {
  const confirmLabel = lang === "en" ? "✅ Confirm fixed" : "✅ แก้ไขแล้วจริง";
  const rejectLabel = lang === "en" ? "❌ Not fixed yet" : "❌ ยังไม่เรียบร้อย";

  return {
    items: [
      {
        type: "action",
        action: {
          type: "postback",
          label: confirmLabel,
          data: JSON.stringify({ action: "confirm_ticket_resolved", ticket_id: ticketId, request_id: requestId }),
          displayText: confirmLabel,
        },
      },
      {
        type: "action",
        action: {
          type: "postback",
          label: rejectLabel,
          data: JSON.stringify({ action: "reject_ticket_resolved", ticket_id: ticketId, request_id: requestId }),
          displayText: rejectLabel,
        },
      },
    ],
  };
}

export async function notifyLineTicketUpdate(
  ticket: TicketForLine,
  reporter: ReporterForLine,
  options: GenericTicketUpdateOptions,
): Promise<LinePushResult> {
  const lineUserId = (reporter.line_user_id || "").trim();
  if (!lineUserId) return { attempted: false, sent: false, reason: "reporter_has_no_line_user_id" };

  const token = getLineToken();
  if (!token) return { attempted: false, sent: false, reason: "line_channel_access_token_missing" };

  const lang = reporter.language_code === "en" ? "en" : "th";

  try {
    const res = await pushLineText(lineUserId, token, buildGenericUpdateMessage(ticket, lang, options));
    if (!res.ok) {
      return { attempted: true, sent: false, reason: `line_push_failed_${res.status}` };
    }

    return { attempted: true, sent: true };
  } catch {
    return { attempted: true, sent: false, reason: "line_push_exception" };
  }
}

export async function notifyLineResolvedConfirmation(
  ticket: TicketForLine,
  reporter: ReporterForLine,
): Promise<LinePushResult> {
  const lineUserId = (reporter.line_user_id || "").trim();
  if (!lineUserId) return { attempted: false, sent: false, reason: "reporter_has_no_line_user_id" };

  const token = getLineToken();
  if (!token) return { attempted: false, sent: false, reason: "line_channel_access_token_missing" };

  const requestId = crypto.randomUUID();
  const lang = reporter.language_code === "en" ? "en" : "th";

  const request = await query(
    `INSERT INTO slip_processing.ticket_confirmation_requests
       (id, ticket_id, channel, recipient_id, status, requested_at, created_at, updated_at)
     VALUES ($1, $2, 'line', $3, 'pending', NOW(), NOW(), NOW())
     ON CONFLICT (ticket_id) WHERE status = 'pending'
     DO UPDATE SET requested_at=NOW(), recipient_id=EXCLUDED.recipient_id, updated_at=NOW()
     RETURNING id`,
    [requestId, ticket.id, lineUserId],
  );
  const effectiveRequestId = request.rows[0]?.id || requestId;

  const body = {
    to: lineUserId,
    messages: [
      {
        type: "text",
        text: buildResolvedMessage(ticket, lang),
        quickReply: buildQuickReply(ticket.id, effectiveRequestId, lang),
      },
    ],
  };

  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      await query(
        `UPDATE slip_processing.ticket_confirmation_requests
         SET status='failed', response_text=$2, updated_at=NOW()
         WHERE id=$1 AND status='pending'`,
        [effectiveRequestId, `LINE push failed: ${res.status} ${errorText}`.slice(0, 1000)],
      );
      return { attempted: true, sent: false, requestId: effectiveRequestId, reason: `line_push_failed_${res.status}` };
    }

    return { attempted: true, sent: true, requestId: effectiveRequestId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await query(
      `UPDATE slip_processing.ticket_confirmation_requests
       SET status='failed', response_text=$2, updated_at=NOW()
       WHERE id=$1 AND status='pending'`,
      [effectiveRequestId, String(message).slice(0, 1000)],
    );
    return { attempted: true, sent: false, requestId: effectiveRequestId, reason: "line_push_exception" };
  }
}
