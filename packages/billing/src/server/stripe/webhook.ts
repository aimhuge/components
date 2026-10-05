/**
 * The Stripe webhook — the AUTHORITY on subscription state. The adapter
 * mirrors eagerly so the UI updates on click, but portal edits, renewals,
 * failed retries and dunning cancellations arrive ONLY here. An app that
 * doesn't wire it up has a billing page that silently drifts from what
 * customers pay.
 *
 * Four properties, in order of how badly they hurt:
 *
 *  1. Signature verification on the RAW body (`req.text()`, never `.json()` —
 *     re-serializing changes the bytes and every signature fails). Without it
 *     this is an unauthenticated "upgrade any org" endpoint.
 *  2. Idempotency. Stripe delivers at-least-once and retries non-2xx for three
 *     days. `billing_webhook_events` has the event id as PK, so a duplicate is
 *     a unique violation, not a second invoice. On handler failure the claim
 *     is RELEASED so the retry actually re-runs.
 *  3. Status codes. 2xx = stop retrying. Bad signature 400 (never becomes
 *     valid); handler failure 500 (retry); deliberately ignored 200.
 *  4. Other apps' events. On a Stripe account shared by several apps, every
 *     endpoint receives every event. One stamped with another app's
 *     `metadata.app` is acknowledged (200) before anything is claimed or read
 *     — otherwise its unknown price would 500 here, and Stripe would retry it
 *     for three days.
 *
 * Framework-free: takes a Fetch `Request`, returns a `Response`. A Next route
 * is `export const POST = (req: Request) => billing.handleStripeWebhook(req)`.
 */
import type Stripe from "stripe";
import type { Service } from "../runtime.js";
import { stripeObjectApp } from "./map.js";
import type { StripeEnv } from "./sync.js";
import { HANDLED_EVENTS, handleEvent } from "./webhook-events.js";

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function handleStripeWebhook(
  env: StripeEnv,
  req: Request,
  getService: () => Service | null,
): Promise<Response> {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing stripe-signature" }, 400);
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = await env.stripe
      .client()
      .webhooks.constructEventAsync(payload, signature, env.stripe.config().webhookSecret);
  } catch (error) {
    console.error(`[billing:${env.rt.app}:webhook] signature verification failed`, error);
    return json({ error: "Invalid signature" }, 400);
  }

  const owner = stripeObjectApp(event.data.object);
  if (owner && owner !== env.rt.app) return json({ received: true, ignored: "other app", app: owner });

  const service = getService();
  // 500 so Stripe retries — the event is real and we couldn't store it.
  if (!service) return json({ error: "No database" }, 500);

  // Claim by INSERT, so two simultaneous deliveries can't both decide they're first.
  const { error: claimError } = await service
    .from("billing_webhook_events")
    .insert({ id: event.id, provider: "stripe", type: event.type });
  if (claimError) {
    if (claimError.code === "23505") return json({ received: true, duplicate: true });
    console.error(`[billing:${env.rt.app}:webhook] could not record event`, claimError);
    return json({ error: "Could not record event" }, 500);
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    await markProcessed(service, event.id, null, null);
    return json({ received: true, ignored: true });
  }

  try {
    const orgId = await handleEvent(env, service, event);
    await markProcessed(service, event.id, orgId, null);
    return json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[billing:${env.rt.app}:webhook] ${event.type} failed`, error);
    await markProcessed(service, event.id, null, message);
    // Release the claim, or Stripe's retry is swallowed as a duplicate.
    await service.from("billing_webhook_events").delete().eq("id", event.id);
    return json({ error: "Handler failed" }, 500);
  }
}

async function markProcessed(service: Service, eventId: string, orgId: string | null, error: string | null) {
  await service
    .from("billing_webhook_events")
    .update({ processed_at: new Date().toISOString(), org_id: orgId, error })
    .eq("id", eventId);
}
