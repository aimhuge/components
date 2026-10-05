import { stripeObjectApp } from "./map.js";
import { HANDLED_EVENTS, handleEvent } from "./webhook-events.js";
const json = (body, status = 200) => Response.json(body, { status });
export async function handleStripeWebhook(env, req, getService) {
    const signature = req.headers.get("stripe-signature");
    if (!signature)
        return json({ error: "Missing stripe-signature" }, 400);
    const payload = await req.text();
    let event;
    try {
        event = await env.stripe
            .client()
            .webhooks.constructEventAsync(payload, signature, env.stripe.config().webhookSecret);
    }
    catch (error) {
        console.error(`[billing:${env.rt.app}:webhook] signature verification failed`, error);
        return json({ error: "Invalid signature" }, 400);
    }
    const owner = stripeObjectApp(event.data.object);
    if (owner && owner !== env.rt.app)
        return json({ received: true, ignored: "other app", app: owner });
    const service = getService();
    // 500 so Stripe retries — the event is real and we couldn't store it.
    if (!service)
        return json({ error: "No database" }, 500);
    // Claim by INSERT, so two simultaneous deliveries can't both decide they're first.
    const { error: claimError } = await service
        .from("billing_webhook_events")
        .insert({ id: event.id, provider: "stripe", type: event.type });
    if (claimError) {
        if (claimError.code === "23505")
            return json({ received: true, duplicate: true });
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[billing:${env.rt.app}:webhook] ${event.type} failed`, error);
        await markProcessed(service, event.id, null, message);
        // Release the claim, or Stripe's retry is swallowed as a duplicate.
        await service.from("billing_webhook_events").delete().eq("id", event.id);
        return json({ error: "Handler failed" }, 500);
    }
}
async function markProcessed(service, eventId, orgId, error) {
    await service
        .from("billing_webhook_events")
        .update({ processed_at: new Date().toISOString(), org_id: orgId, error })
        .eq("id", eventId);
}
