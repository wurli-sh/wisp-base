import type { Db } from "../db/client.js";

export function buildEmail(params: { appOrigin: string }): {
  subject: string;
  text: string;
  html: string;
} {
  const inboxUrl = `${params.appOrigin.replace(/\/$/, "")}/inbox`;
  const subject = "You have a stock gift waiting in Wisp";
  const text = [
    "Someone sent you a stock gift on Wisp.",
    "",
    "Sign in to Wisp and open your Inbox to view and claim it.",
    "",
    inboxUrl,
    "",
    "This message does not include gift details for your privacy.",
  ].join("\n");
  const html = [
    "<p>Someone sent you a stock gift on Wisp.</p>",
    `<p>Sign in to Wisp and open your <a href="${inboxUrl}">Inbox</a> to view and claim it.</p>`,
    "<p>This message does not include gift details for your privacy.</p>",
  ].join("");
  assertSafeEmailContent({ subject, text, html });
  return { subject, text, html };
}

export function assertSafeEmailContent(email: {
  subject: string;
  text: string;
  html: string;
}): void {
  const blob = `${email.subject}\n${email.text}\n${email.html}`;
  if (/0x[a-fA-F0-9]{40}/.test(blob) || /0x[a-fA-F0-9]{64}/.test(blob)) {
    throw new Error("notification_unavailable");
  }
  if (/\bwAAPL\b|\bwNVDA\b|\bwTSLA\b/i.test(blob)) throw new Error("notification_unavailable");
  if (/\$\d/.test(blob)) throw new Error("notification_unavailable");
  if (/\bsignature\b|\bsecret\b/i.test(blob)) throw new Error("notification_unavailable");
}

export async function enqueueGiftWaitingNotification(
  db: Db,
  giftId: string,
  appOrigin: string,
): Promise<void> {
  const content = buildEmail({ appOrigin });
  const { error } = await db.from("notification_outbox").upsert(
    {
      gift_id: giftId,
      kind: "gift_waiting",
      status: "queued",
      payload: { channel: "email", subject: content.subject },
    },
    { onConflict: "gift_id,kind", ignoreDuplicates: true },
  );
  if (error) throw error;
}
