/**
 * The mock provider's card operations. The "token" is a test-card reference
 * minted in the browser by `@aimhuge/billing/test-cards`; only brand, last
 * four and expiry are ever stored. The test outcome (succeeds / declined /
 * insufficient funds) rides on the provider id so a later charge can find it —
 * the mock standing in for a provider's own record of the card.
 */
import { BillingError } from "../errors.js";
import { parseCardToken } from "../test-cards.js";
import { PAYMENT_METHOD_COLUMNS, toPaymentMethod } from "./rows.js";
import { ensureSubscription, logBillingEvent } from "./store.js";
export async function defaultPaymentMethod(ctx) {
    const { data } = await ctx.service
        .from("org_payment_methods")
        .select(`${PAYMENT_METHOD_COLUMNS}, provider_payment_method_id`)
        .eq("org_id", ctx.orgId)
        .eq("is_default", true)
        .maybeSingle();
    return data ?? null;
}
async function clearDefault(ctx) {
    await ctx.service
        .from("org_payment_methods")
        .update({ is_default: false })
        .eq("org_id", ctx.orgId)
        .eq("is_default", true);
}
/**
 * "Charge" a card: the outcome was decided when the test number was chosen.
 * A zero-or-negative amount always succeeds — a credit note isn't a charge,
 * and declining one would fail a downgrade for no reason.
 */
export async function charge(ctx, method, amountCents) {
    if (amountCents <= 0)
        return { ok: true, reason: "" };
    const id = method.provider_payment_method_id ?? "";
    if (id.includes("_declined_")) {
        return { ok: false, reason: `Your ${method.brand} card ending ${method.last4} was declined.` };
    }
    if (id.includes("_insufficient_funds_")) {
        return {
            ok: false,
            reason: `Your ${method.brand} card ending ${method.last4} was declined for insufficient funds.`,
        };
    }
    await logBillingEvent(ctx.service, ctx.orgId, "charge.succeeded", ctx.actorEmail, {
        amountCents,
        last4: method.last4,
    });
    return { ok: true, reason: "" };
}
export async function attachMockCard(ctx, input) {
    const parsed = parseCardToken(input.token);
    if (!parsed)
        throw new BillingError("That card couldn't be read. Try entering it again.");
    // Demote first, then insert as default: the partial unique index allows one
    // default per org, so inserting first would collide with the incumbent.
    const makeDefault = input.makeDefault || !(await defaultPaymentMethod(ctx));
    if (makeDefault)
        await clearDefault(ctx);
    const { data, error } = await ctx.service
        .from("org_payment_methods")
        .insert({
        org_id: ctx.orgId,
        brand: parsed.brand,
        last4: parsed.last4,
        exp_month: parsed.expMonth,
        exp_year: parsed.expYear,
        holder_name: null,
        is_default: makeDefault,
        provider: "mock",
        provider_payment_method_id: `pm_mock_${parsed.outcome}_${parsed.last4}`,
    })
        .select(PAYMENT_METHOD_COLUMNS)
        .single();
    if (error || !data)
        throw new BillingError(error?.message ?? "Could not save that card.");
    await logBillingEvent(ctx.service, ctx.orgId, "payment_method.attached", ctx.actorEmail, {
        brand: parsed.brand,
        last4: parsed.last4,
    });
    return toPaymentMethod(data);
}
export async function detachMockCard(rt, ctx, paymentMethodId) {
    const { data: method } = await ctx.service
        .from("org_payment_methods")
        .select("id, is_default")
        .eq("org_id", ctx.orgId)
        .eq("id", paymentMethodId)
        .maybeSingle();
    if (!method)
        throw new BillingError("That payment method is already gone.");
    const subscription = await ensureSubscription(rt, ctx.service, ctx.orgId);
    const { count } = await ctx.service
        .from("org_payment_methods")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.orgId);
    // The last card off a paid plan would leave a subscription renewing against
    // nothing. Refuse now rather than fail at renewal a month later.
    if ((count ?? 0) <= 1 && subscription.unitAmountCents > 0) {
        throw new BillingError("This is the only card on a paid plan. Add another first, or switch to Free.");
    }
    const { error } = await ctx.service
        .from("org_payment_methods")
        .delete()
        .eq("org_id", ctx.orgId)
        .eq("id", paymentMethodId);
    if (error)
        throw new BillingError(error.message);
    // Never leave cards with no default — promote the newest.
    if (method.is_default) {
        const { data: fallback } = await ctx.service
            .from("org_payment_methods")
            .select("id")
            .eq("org_id", ctx.orgId)
            .order("created_at", { ascending: false })
            .limit(1);
        const promote = (fallback ?? [])[0]?.id;
        if (promote) {
            await ctx.service.from("org_payment_methods").update({ is_default: true }).eq("org_id", ctx.orgId).eq("id", promote);
        }
    }
    await logBillingEvent(ctx.service, ctx.orgId, "payment_method.detached", ctx.actorEmail, { paymentMethodId });
}
export async function setDefaultMockCard(ctx, paymentMethodId) {
    const { data: method } = await ctx.service
        .from("org_payment_methods")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("id", paymentMethodId)
        .maybeSingle();
    if (!method)
        throw new BillingError("That payment method is no longer available.");
    await clearDefault(ctx);
    const { error } = await ctx.service
        .from("org_payment_methods")
        .update({ is_default: true })
        .eq("org_id", ctx.orgId)
        .eq("id", paymentMethodId);
    if (error)
        throw new BillingError(error.message);
    await logBillingEvent(ctx.service, ctx.orgId, "payment_method.default_changed", ctx.actorEmail, {
        paymentMethodId,
    });
}
