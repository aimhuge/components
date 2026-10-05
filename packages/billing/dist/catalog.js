/**
 * The plan catalog — each app defines its own; this module gives it the
 * arithmetic.
 *
 * An app's plans carry whatever the app gates on (DeckCP: "removes branding",
 * "PPTX export"; BlastCP: properties, channels, agent tokens). The package
 * needs only the fields that decide what a plan COSTS — `BasePlan` — plus
 * optional per-meter allowances for the usage ledger. Everything else rides
 * along untouched, typed by the app's own plan interface.
 *
 * Editing a price changes what NEW purchases cost and nothing else: a
 * subscription freezes its unit price at purchase (`unitAmountCents`) and an
 * issued invoice freezes its totals. A catalog edit must never reprice an
 * existing customer or rewrite an invoice someone has filed.
 *
 * GATE ON A CAPABILITY OR A LIMIT, NEVER ON A PLAN ID. `plan === "pro"` is how
 * a new top tier ends up treated as unpaid. Read `catalog.get(id).someFlag`.
 */
export const BILLING_INTERVALS = ["monthly", "yearly"];
export function isBillingInterval(value) {
    return value === "monthly" || value === "yearly";
}
export function defineCatalog(spec) {
    const yearlyMonthsCharged = spec.yearlyMonthsCharged ?? 10;
    const order = [...spec.order];
    if (!order.includes(spec.free))
        throw new Error(`Catalog: free plan "${spec.free}" is not in order`);
    for (const id of order) {
        const plan = spec.plans[id];
        if (!plan)
            throw new Error(`Catalog: "${id}" is in order but has no plan`);
        if (plan.id !== id)
            throw new Error(`Catalog: plan keyed "${id}" says its id is "${plan.id}"`);
        if (!Number.isInteger(plan.monthlyUnitAmountCents) || plan.monthlyUnitAmountCents < 0) {
            throw new Error(`Catalog: "${id}" must be priced in whole, non-negative cents`);
        }
    }
    if (spec.plans[spec.free].monthlyUnitAmountCents !== 0) {
        throw new Error(`Catalog: the free plan "${spec.free}" must cost 0`);
    }
    const isPlanId = (value) => typeof value === "string" && order.includes(value);
    const get = (id) => isPlanId(id) ? spec.plans[id] : spec.plans[spec.free];
    const priceCents = (plan, interval) => {
        const monthly = get(plan).monthlyUnitAmountCents;
        return interval === "yearly" ? monthly * yearlyMonthsCharged : monthly;
    };
    const totalCents = (plan, interval, seats) => {
        const unit = priceCents(plan, interval);
        if (unit === 0)
            return 0;
        return unit * Math.max(1, get(plan).perSeat ? Math.trunc(seats) || 1 : 1);
    };
    return {
        plans: spec.plans,
        order,
        free: spec.free,
        yearlyMonthsCharged,
        paid: order.filter((id) => spec.plans[id].monthlyUnitAmountCents > 0),
        get,
        isPlanId,
        isUpgrade: (from, to) => order.indexOf(to) > order.indexOf(from),
        priceCents,
        totalCents,
        yearlySavingsCents: (plan, seats = 1) => {
            const n = get(plan).perSeat ? Math.max(1, seats) : 1;
            return get(plan).monthlyUnitAmountCents * 12 * n - priceCents(plan, "yearly") * n;
        },
        allowance: (plan, meter) => get(plan).allowances?.[meter] ?? null,
    };
}
/** "per person, per month" — the cadence line under a price. */
export function cadenceLabel(plan, interval) {
    if (plan.monthlyUnitAmountCents === 0)
        return "forever";
    const per = plan.perSeat ? "per person, " : "";
    return interval === "yearly" ? `${per}per year` : `${per}per month`;
}
