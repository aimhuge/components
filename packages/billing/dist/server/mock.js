import { BillingError } from "../errors.js";
import { clampSeats, periodFrom, prorateChange, renewalLines } from "../period.js";
import { attachMockCard, charge, defaultPaymentMethod, detachMockCard, setDefaultMockCard } from "./mock-cards.js";
import { ensureSubscription, issueInvoice, logBillingEvent, saveSubscription } from "./store.js";
export function createMockProvider(rt) {
    const { catalog } = rt;
    async function toFree(ctx, current) {
        // Effective immediately, with the unused remainder credited. Holding the
        // paid plan to period end means a customer who left still shows as paying;
        // cancel-at-period-end is the separate, explicit gesture for that intent.
        const now = new Date();
        const credit = prorateChange(catalog, {
            now,
            period: { start: current.currentPeriodStart, end: current.currentPeriodEnd },
            from: current,
            to: { plan: catalog.free, interval: current.interval, seats: 1 },
        });
        if (credit.totalCents < 0) {
            await issueInvoice(rt, ctx.service, ctx.orgId, {
                lines: credit.lines,
                status: "paid",
                paid: true,
                description: `Credit for unused time on ${catalog.get(current.plan).name}`,
                periodStart: now.toISOString(),
                periodEnd: current.currentPeriodEnd,
            });
        }
        const period = periodFrom(now, "monthly");
        const next = await saveSubscription(rt, ctx.service, ctx.orgId, {
            plan: catalog.free,
            status: "active",
            interval: "monthly",
            seats: 1,
            unitAmountCents: 0,
            currentPeriodStart: period.start,
            currentPeriodEnd: period.end,
            cancelAtPeriodEnd: false,
            canceledAt: null,
        });
        await logBillingEvent(ctx.service, ctx.orgId, "subscription.updated", ctx.actorEmail, {
            from: current.plan,
            to: catalog.free,
            creditCents: credit.totalCents,
        });
        return next;
    }
    async function changePlan(ctx, input) {
        const current = await ensureSubscription(rt, ctx.service, ctx.orgId);
        const seats = clampSeats(input.seats);
        const unchanged = current.plan === input.plan &&
            current.interval === input.interval &&
            current.seats === seats &&
            !current.cancelAtPeriodEnd;
        if (unchanged)
            return current;
        if (input.plan === catalog.free)
            return toFree(ctx, current);
        const method = await defaultPaymentMethod(ctx);
        if (!method)
            throw new BillingError("Add a payment method before changing to a paid plan.");
        const now = new Date();
        const change = current.unitAmountCents > 0
            ? prorateChange(catalog, {
                now,
                period: { start: current.currentPeriodStart, end: current.currentPeriodEnd },
                from: current,
                to: { plan: input.plan, interval: input.interval, seats },
            })
            : (() => {
                // First paid period: full price, no credit — nothing paid behind them.
                const period = periodFrom(now, input.interval);
                const lines = renewalLines(catalog, input.plan, input.interval, seats, period);
                return { lines, totalCents: lines.reduce((t, l) => t + l.amountCents, 0), period };
            })();
        const charged = await charge(ctx, method, change.totalCents);
        await issueInvoice(rt, ctx.service, ctx.orgId, {
            lines: change.lines,
            status: charged.ok ? "paid" : "open",
            paid: charged.ok,
            description: `${catalog.get(input.plan).name} — ${input.interval === "yearly" ? "annual" : "monthly"}`,
            periodStart: change.period.start,
            periodEnd: change.period.end,
        });
        // A failed charge still applies the plan, past_due. The customer keeps
        // access while dunning runs — pulling a plan over an expired card is how
        // you lose a customer over $16.
        const next = await saveSubscription(rt, ctx.service, ctx.orgId, {
            plan: input.plan,
            status: charged.ok ? "active" : "past_due",
            interval: input.interval,
            seats,
            unitAmountCents: catalog.priceCents(input.plan, input.interval),
            currentPeriodStart: change.period.start,
            currentPeriodEnd: change.period.end,
            cancelAtPeriodEnd: false,
            canceledAt: null,
            provider: "mock",
            providerCustomerId: current.providerCustomerId ?? `cus_mock_${ctx.orgId.slice(0, 8)}`,
            providerSubscriptionId: current.providerSubscriptionId ?? `sub_mock_${ctx.orgId.slice(0, 8)}`,
        });
        await logBillingEvent(ctx.service, ctx.orgId, charged.ok ? "subscription.updated" : "invoice.payment_failed", ctx.actorEmail, {
            from: current.plan,
            to: input.plan,
            interval: input.interval,
            seats,
            amountCents: change.totalCents,
            reason: charged.reason,
        });
        if (!charged.ok)
            throw new BillingError(charged.reason);
        return next;
    }
    return {
        id: "mock",
        label: "Test billing",
        hostedCheckout: true,
        live: false,
        // The mock renders its own card form against published test numbers.
        managesPaymentMethodsExternally: false,
        async startCheckout(ctx, input) {
            // Free needs no authorization; a card on file is a mandate to charge it.
            if (input.plan === catalog.free || (await defaultPaymentMethod(ctx))) {
                return { kind: "applied", subscription: await changePlan(ctx, input) };
            }
            const params = new URLSearchParams({
                plan: input.plan,
                interval: input.interval,
                seats: String(clampSeats(input.seats)),
                next: input.returnPath,
            });
            return { kind: "redirect", url: `${rt.mockCheckoutPath(ctx.orgSlug)}?${params}` };
        },
        changePlan,
        async cancelSubscription(ctx) {
            const current = await ensureSubscription(rt, ctx.service, ctx.orgId);
            if (current.plan === catalog.free)
                throw new BillingError("The free plan has nothing to cancel.");
            // Plan and status untouched: they paid through the period end.
            const next = await saveSubscription(rt, ctx.service, ctx.orgId, {
                cancelAtPeriodEnd: true,
                canceledAt: new Date().toISOString(),
            });
            await logBillingEvent(ctx.service, ctx.orgId, "subscription.canceled", ctx.actorEmail, {
                plan: current.plan,
                effectiveAt: current.currentPeriodEnd,
            });
            return next;
        },
        async resumeSubscription(ctx) {
            const current = await ensureSubscription(rt, ctx.service, ctx.orgId);
            if (!current.cancelAtPeriodEnd)
                return current;
            const next = await saveSubscription(rt, ctx.service, ctx.orgId, { cancelAtPeriodEnd: false, canceledAt: null });
            await logBillingEvent(ctx.service, ctx.orgId, "subscription.resumed", ctx.actorEmail, { plan: current.plan });
            return next;
        },
        attachPaymentMethod: attachMockCard,
        detachPaymentMethod: (ctx, id) => detachMockCard(rt, ctx, id),
        setDefaultPaymentMethod: setDefaultMockCard,
        // No hosted billing UI — the in-app page IS the surface.
        billingPortalUrl: async () => null,
        reconcile: async () => { },
    };
}
