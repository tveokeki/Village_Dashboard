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
  skipLineUserId?: string;
  isNewTicket?: boolean;
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

function buildNewTicketMessage(ticket: TicketForLine, lang: string) {
  const address = compactAddress(ticket);
  if (lang === "en") {
    return [
      `🔔 New problem report created!`,
      `Ticket: ${ticket.ticket_number}`,
      `Issue: ${ticket.problem_title}`,
      address ? `House/Unit: ${address}` : null,
      `Details: ${ticketDetailUrl(ticket)}`,
    ].filter(Boolean).join("\n");
  }

  return [
    `🔔 มีรายงานปัญหาใหม่ถูกสร้างขึ้น`,
    `Ticket: ${ticket.ticket_number}`,
    `เรื่อง: ${ticket.problem_title}`,
    address ? `บ้าน/ยูนิต: ${address}` : null,
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

export async function notifyLineTicketUpdateToManagers(
  ticket: TicketForLine,
  options: GenericTicketUpdateOptions & { isResolved?: boolean },
): Promise<void> {
  const token = getLineToken();
  if (!token) return;

  try {
    const managers = await query(
      `SELECT email, line_id, preferred_language 
       FROM slip_processing.web_users 
       WHERE deleted_at IS NULL AND (role = 'manager' OR role = 'admin' OR is_admin = TRUE)`
    );

    const messageTh = options.isResolved 
      ? buildResolvedMessage(ticket, "th") 
      : options.isNewTicket
        ? buildNewTicketMessage(ticket, "th")
        : buildGenericUpdateMessage(ticket, "th", options);

    const messageEn = options.isResolved 
      ? buildResolvedMessage(ticket, "en") 
      : options.isNewTicket
        ? buildNewTicketMessage(ticket, "en")
        : buildGenericUpdateMessage(ticket, "en", options);

    for (const manager of managers.rows) {
      let lineUserId = (manager.line_id || "").trim();
      if (!lineUserId && manager.email?.endsWith("@line.oauth")) {
        lineUserId = manager.email.split("@")[0].trim();
      }

      if (!lineUserId) continue;

      if (lineUserId === (options.skipLineUserId || "").trim()) {
        continue;
      }

      const lang = manager.preferred_language === "en" ? "en" : "th";
      const text = lang === "en" ? messageEn : messageTh;

      await pushLineText(lineUserId, token, text);
    }
  } catch (err) {
    console.error("Failed to notify managers:", err);
  }
}

export async function notifyLineExpenseUpdate(requestId: string, action: string, actorUserId: string): Promise<void> {
  const token = getLineToken();
  if (!token) return;

  try {
    // 1. Fetch request details
    const requestRes = await query(
      `SELECT er.*, 
              COALESCE(req.display_name, req.email) AS requester_name,
              COALESCE(act.display_name, act.email) AS actor_name
       FROM slip_processing.expense_requests er
       LEFT JOIN slip_processing.web_users req ON req.id = er.requested_by
       LEFT JOIN slip_processing.web_users act ON act.id = $2
       WHERE er.id = $1`,
      [requestId, actorUserId]
    );
    const r = requestRes.rows[0];
    if (!r) return;

    // 2. Fetch users with roles manager, accountant, president, vice_president, admin who have line_id
    const usersRes = await query(
      `SELECT DISTINCT wu.id, wu.display_name, wu.line_id, wu.preferred_language
       FROM slip_processing.web_users wu
       LEFT JOIN slip_processing.user_roles ur ON ur.user_id = wu.id AND ur.deleted_at IS NULL
       LEFT JOIN slip_processing.roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
       WHERE wu.deleted_at IS NULL 
         AND (
           r.role_code IN ('manager', 'accountant', 'president', 'vice_president', 'admin')
           OR wu.role IN ('manager', 'accountant', 'admin')
           OR wu.is_admin = TRUE
         )
         AND wu.line_id IS NOT NULL AND wu.line_id <> ''`
    );

    // 3. Build the messages
    const amountStr = Number(r.total_requested || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
    const approvedStr = Number(r.total_approved || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
    const disbursedStr = Number(r.disbursed_amount || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

    let messageTh = "";
    let messageEn = "";
    let quickReply: any = null;

    if (action === "pending" || action === "submitted" || action === "created") {
      messageTh = `🔔 คำขอเบิกค่าใช้จ่ายใหม่: ${r.request_number}\nเรื่อง: ${r.title}\nผู้ขอเบิก: ${r.requester_name}\nจำนวนเงิน: ${amountStr} บาท\nสถานะ: รออนุมัติ\n\n(สิทธิ์ประธาน/รองประธาน สามารถพิมพ์ 'อนุมัติ ${r.request_number}' หรือ 'ไม่อนุมัติ ${r.request_number}' เพื่ออนุมัติ/ปฏิเสธได้ทันทีค่ะ)`;
      messageEn = `🔔 New Expense Request: ${r.request_number}\nTitle: ${r.title}\nRequester: ${r.requester_name}\nAmount: ${amountStr} THB\nStatus: Pending Approval\n\n(Presidents/Vice Presidents can reply 'Approve ${r.request_number}' or 'Reject ${r.request_number}' to authorize)`;

      quickReply = {
        items: [
          {
            type: "action",
            action: {
              type: "message",
              label: "✅ อนุมัติ",
              text: `อนุมัติ ${r.request_number}`
            }
          },
          {
            type: "action",
            action: {
              type: "message",
              label: "❌ ไม่อนุมัติ",
              text: `ไม่อนุมัติ ${r.request_number}`
            }
          }
        ]
      };
    } 
    else if (action === "approved") {
      messageTh = `✅ อนุมัติใบเบิกแล้ว: ${r.request_number}\nเรื่อง: ${r.title}\nยอดเงินอนุมัติ: ${approvedStr} บาท\nผู้อนุมัติ: ${r.actor_name}\nสถานะ: รอฝ่ายบัญชีโอนเงินให้ผู้จัดการ`;
      messageEn = `✅ Expense Approved: ${r.request_number}\nTitle: ${r.title}\nApproved Amount: ${approvedStr} THB\nApproved By: ${r.actor_name}\nStatus: Waiting for accountant disbursement`;
    } 
    else if (action === "rejected") {
      messageTh = `❌ ปฏิเสธใบเบิกแล้ว: ${r.request_number}\nเรื่อง: ${r.title}\nผู้ดำเนินการ: ${r.actor_name}\nสถานะ: ปฏิเสธการเบิกเงิน`;
      messageEn = `❌ Expense Rejected: ${r.request_number}\nTitle: ${r.title}\nRejected By: ${r.actor_name}\nStatus: Rejected`;
    } 
    else if (action === "disbursed") {
      const channelLabel = r.disbursal_channel === "bank_transfer" ? "โอนเงินผ่านธนาคาร" : r.disbursal_channel === "cash" ? "เงินสด" : "ช่องทางอื่น";
      const channelLabelEn = r.disbursal_channel === "bank_transfer" ? "Bank Transfer" : r.disbursal_channel === "cash" ? "Cash" : "Other";
      messageTh = `💵 โอนเงินให้ผู้จัดการแล้ว: ${r.request_number}\nเรื่อง: ${r.title}\nยอดโอน: ${disbursedStr} บาท\nช่องทาง: ${channelLabel}\nสถานะ: ผู้จัดการอยู่ระหว่างจ่ายเงินและรายงานผลจริง`;
      messageEn = `💵 Disbursed to Manager: ${r.request_number}\nTitle: ${r.title}\nDisbursed Amount: ${disbursedStr} THB\nChannel: ${channelLabelEn}\nStatus: Spent report pending from manager`;
    } 
    else if (action === "spent") {
      messageTh = `📋 ผู้จัดการจ่ายเงินครบแล้ว: ${r.request_number}\nเรื่อง: ${r.title}\nผู้รายงาน: ${r.actor_name}\nสถานะ: รอฝ่ายบัญชีตรวจสอบการใช้จ่ายและปิดยอดบัญชี`;
      messageEn = `📋 Spent Completed: ${r.request_number}\nTitle: ${r.title}\nReported By: ${r.actor_name}\nStatus: Waiting for accountant audit and close`;
    } 
    else if (action === "closed") {
      messageTh = `🔒 ปิดยอดบัญชีเรียบร้อย: ${r.request_number}\nเรื่อง: ${r.title}\nผู้ตรวจสอบ: ${r.actor_name}\nสถานะ: ตรวจสอบงบผ่านเรียบร้อยและปิดยอดบัญชีการเบิกจ่ายค่ะ`;
      messageEn = `🔒 Expense Closed: ${r.request_number}\nTitle: ${r.title}\nAudited By: ${r.actor_name}\nStatus: Audited & closed successfully`;
    } 
    else if (action === "cancelled") {
      messageTh = `🚫 ยกเลิกคำขอเบิกแล้ว: ${r.request_number}\nเรื่อง: ${r.title}\nผู้ดำเนินการ: ${r.actor_name}\nสถานะ: ยกเลิก/Cancelled`;
      messageEn = `🚫 Expense Cancelled: ${r.request_number}\nTitle: ${r.title}\nCancelled By: ${r.actor_name}\nStatus: Cancelled`;
    }

    if (!messageTh) return;

    for (const u of usersRes.rows) {
      const lineUserId = (u.line_id || "").trim();
      if (!lineUserId) continue;

      const lang = u.preferred_language === "en" ? "en" : "th";
      const text = lang === "en" ? messageEn : messageTh;

      await pushLineText(lineUserId, token, text, quickReply);
    }
  } catch (err) {
    console.error("Failed to deliver expense LINE notification:", err);
  }
}
