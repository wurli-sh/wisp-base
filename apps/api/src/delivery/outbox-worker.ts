import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { buildEmail } from "./notifications.js";

async function recipientEmailForGift(db: Db, giftId: string): Promise<string | null> {
  const { data: delivery, error: deliveryError } = await db
    .from("deliveries")
    .select("recipient_profile_id")
    .eq("gift_id", giftId)
    .maybeSingle();
  if (deliveryError) throw deliveryError;
  if (!delivery?.recipient_profile_id) return null;

  const { data: identities, error: identityError } = await db
    .from("identities")
    .select("normalized_identifier")
    .eq("profile_id", delivery.recipient_profile_id)
    .in("provider", ["email", "google"])
    .is("revoked_at", null)
    .not("verified_at", "is", null)
    .limit(1);
  if (identityError) throw identityError;
  return identities?.[0]?.normalized_identifier ?? null;
}

async function sendViaResend(config: Config, to: string): Promise<boolean> {
  if (!config.env.RESEND_API_KEY || !config.env.RESEND_FROM_EMAIL) return false;
  const email = buildEmail({ appOrigin: config.appOrigin });
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.env.RESEND_FROM_EMAIL,
        to: [to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function processNotificationOutbox(db: Db, config: Config, limit = 20): Promise<number> {
  const { data: rows, error } = await db
    .from("notification_outbox")
    .select("id,gift_id,attempts")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  if (!rows?.length) return 0;

  let processed = 0;
  const now = new Date().toISOString();
  for (const row of rows) {
    if (!config.env.RESEND_API_KEY || !config.env.RESEND_FROM_EMAIL) {
      const { error: updateError } = await db
        .from("notification_outbox")
        .update({
          status: "unavailable",
          attempts: row.attempts + 1,
          last_error: "RESEND configuration missing",
          updated_at: now,
        })
        .eq("id", row.id)
        .eq("status", "queued");
      if (updateError) throw updateError;
      processed += 1;
      continue;
    }

    const recipient = await recipientEmailForGift(db, row.gift_id);
    if (!recipient) {
      const { error: unavailableError } = await db
        .from("notification_outbox")
        .update({
          status: "unavailable",
          attempts: row.attempts + 1,
          last_error: "verified recipient email unavailable",
          updated_at: now,
        })
        .eq("id", row.id)
        .eq("status", "queued");
      if (unavailableError) throw unavailableError;
      processed += 1;
      continue;
    }

    const { data: sending, error: sendingError } = await db
      .from("notification_outbox")
      .update({ status: "sending", attempts: row.attempts + 1, updated_at: now })
      .eq("id", row.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (sendingError) throw sendingError;
    if (!sending) continue;

    const sent = await sendViaResend(config, recipient);
    const { error: updateError } = await db
      .from("notification_outbox")
      .update({
        status: sent ? "sent" : "failed",
        last_error: sent ? null : "resend_delivery_failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "sending");
    if (updateError) throw updateError;
    processed += 1;
  }
  return processed;
}
