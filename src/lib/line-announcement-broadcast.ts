export type AnnouncementForLineBroadcast = {
  id: string;
  title_th?: string | null;
  title_en?: string | null;
  content_th?: string | null;
  content_en?: string | null;
};

export type LineBroadcastResult = {
  attempted: boolean;
  sent: boolean;
  reason?: string;
  status?: number;
  requestId?: string | null;
};

const LINE_BROADCAST_URL = "https://api.line.me/v2/bot/message/broadcast";
const LINE_TEXT_LIMIT = 5000;

function getLineToken() {
  return (
    process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ||
    process.env.LINE_CHANNEL_ACCESS_TOKEN ||
    ""
  ).trim();
}

function publicOrigin(explicitOrigin?: string) {
  return (explicitOrigin || process.env.PUBLIC_ORIGIN || process.env.NEXTAUTH_URL || "https://suan-ake.cloud").replace(/\/$/, "");
}

function cleanText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function truncateForLine(text: string) {
  if (text.length <= LINE_TEXT_LIMIT) return text;
  return `${text.slice(0, LINE_TEXT_LIMIT - 1)}…`;
}

export function announcementDetailUrl(announcement: AnnouncementForLineBroadcast, explicitOrigin?: string) {
  const origin = publicOrigin(explicitOrigin);
  const basePath = (process.env.NEXT_PUBLIC_UAT_BASE_PATH || "").replace(/\/$/, "");
  const pathPrefix = basePath && !origin.endsWith(basePath) ? basePath : "";
  return `${origin}${pathPrefix}/announcements?announcement=${encodeURIComponent(announcement.id)}`;
}

export function buildAnnouncementBroadcastMessage(announcement: AnnouncementForLineBroadcast, explicitOrigin?: string) {
  const title = cleanText(announcement.title_th || announcement.title_en) || "ประกาศใหม่";
  const summary = cleanText(announcement.content_th || announcement.content_en);
  const preview = summary ? `${summary.slice(0, 220)}${summary.length > 220 ? "…" : ""}` : "";
  const url = announcementDetailUrl(announcement, explicitOrigin);

  return truncateForLine([
    "📢 ประกาศใหม่จากนิติบุคคลฯ",
    title,
    preview ? `รายละเอียด: ${preview}` : null,
    `อ่านประกาศ: ${url}`,
  ].filter(Boolean).join("\n"));
}

export async function broadcastAnnouncementToLine(announcement: AnnouncementForLineBroadcast): Promise<LineBroadcastResult> {
  const token = getLineToken();
  if (!token) {
    return { attempted: false, sent: false, reason: "line_channel_access_token_missing" };
  }

  const text = buildAnnouncementBroadcastMessage(announcement);

  try {
    const res = await fetch(LINE_BROADCAST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ type: "text", text }],
      }),
    });

    const requestId = res.headers.get("x-line-request-id");
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.error("LINE announcement broadcast failed", {
        status: res.status,
        requestId,
        error: errorText.slice(0, 1000),
      });
      return { attempted: true, sent: false, status: res.status, requestId, reason: `line_broadcast_failed_${res.status}` };
    }

    return { attempted: true, sent: true, requestId };
  } catch (err) {
    console.error("LINE announcement broadcast exception", { message: err instanceof Error ? err.message : String(err) });
    return { attempted: true, sent: false, reason: "line_broadcast_exception" };
  }
}
