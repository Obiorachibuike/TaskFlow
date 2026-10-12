/**
 * Email transport abstraction.
 * - Dev transport (default): logs the email to the server console.
 * - Resend transport: sends via the Resend HTTP API when RESEND_API_KEY is set.
 */
import { logger } from "@/lib/logger";
import { absoluteUrl } from "@/lib/utils";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailTransport {
  readonly name: string;
  send(message: EmailMessage): Promise<{ id: string }>;
}

class ConsoleTransport implements EmailTransport {
  readonly name = "console";
  async send(message: EmailMessage): Promise<{ id: string }> {
    logger.info("email.console", {
      to: message.to,
      subject: message.subject,
      preview: message.text.slice(0, 200),
    });
    return { id: `console_${Date.now()}` };
  }
}

class ResendTransport implements EmailTransport {
  readonly name = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<{ id: string }> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html ?? `<pre>${escapeHtml(message.text)}</pre>`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend API error ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { id?: string };
    return { id: data.id ?? "unknown" };
  }
}

let transport: EmailTransport | null = null;

export function getEmailTransport(): EmailTransport {
  if (transport) return transport;
  const apiKey = process.env.RESEND_API_KEY;
  transport = apiKey
    ? new ResendTransport(apiKey, process.env.EMAIL_FROM ?? "TaskFlow <onboarding@resend.dev>")
    : new ConsoleTransport();
  return transport;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Templated messages ──────────────────────────────────────────────────────

export async function sendVerificationEmail(to: string, name: string, token: string) {
  const link = absoluteUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  return getEmailTransport().send({
    to,
    subject: "Verify your email — TaskFlow",
    text: `Hi ${name},\n\nWelcome to TaskFlow! Verify your email address by opening:\n${link}\n\nThis link expires in 24 hours. If you didn't create an account, you can ignore this email.\n\n— TaskFlow`,
  });
}

export async function sendPasswordResetEmail(to: string, name: string, token: string) {
  const link = absoluteUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  return getEmailTransport().send({
    to,
    subject: "Reset your password — TaskFlow",
    text: `Hi ${name},\n\nUse the link below to choose a new password (expires in 1 hour):\n${link}\n\nIf you didn't request this, you can safely ignore this email.\n\n— TaskFlow`,
  });
}

export async function sendInvitationEmail(
  to: string,
  inviterName: string,
  workspaceName: string,
  role: string,
  token: string,
) {
  const link = absoluteUrl(`/invitations/accept?token=${encodeURIComponent(token)}`);
  return getEmailTransport().send({
    to,
    subject: `${inviterName} invited you to ${workspaceName} on TaskFlow`,
    text: `Hi,\n\n${inviterName} invited you to join the "${workspaceName}" workspace on TaskFlow as ${role}.\n\nAccept the invitation:\n${link}\n\nThis link expires in 7 days.\n\n— TaskFlow`,
  });
}

export async function sendDueDateReminderEmail(
  to: string,
  name: string,
  issues: Array<{ key: string; title: string; dueDate: string; link: string }>,
) {
  const lines = issues
    .map((i) => `• ${i.key} — ${i.title} (due ${i.dueDate})\n  ${i.link}`)
    .join("\n");
  return getEmailTransport().send({
    to,
    subject: `You have ${issues.length} task(s) due soon — TaskFlow`,
    text: `Hi ${name},\n\nHeads up — these assigned tasks are due soon:\n\n${lines}\n\n— TaskFlow`,
  });
}
