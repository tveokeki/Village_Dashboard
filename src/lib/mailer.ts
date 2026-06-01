import dns from "dns/promises";
import nodemailer from "nodemailer";

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function getFromAddress() {
  return process.env.MAIL_FROM || "Suan Ake Lake Park Villa <noreply@suan-ake.cloud>";
}

async function createSmtpTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || "",
        }
      : undefined,
    tls: {
      rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== "false",
    },
  });
}

async function createDirectMxTransport(to: string) {
  const domain = to.split("@")[1]?.toLowerCase();
  if (!domain) throw new Error("Invalid recipient email");

  const mxRecords = await dns.resolveMx(domain);
  if (!mxRecords.length) throw new Error(`No MX records for ${domain}`);
  mxRecords.sort((a, b) => a.priority - b.priority);

  return nodemailer.createTransport({
    host: mxRecords[0].exchange,
    port: 25,
    secure: false,
    name: process.env.MAIL_EHLO_NAME || "suan-ake.cloud",
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
}

export async function sendMail(input: SendMailInput) {
  const smtpTransport = await createSmtpTransport();
  const transport = smtpTransport || (await createDirectMxTransport(input.to));

  return transport.sendMail({
    from: getFromAddress(),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
