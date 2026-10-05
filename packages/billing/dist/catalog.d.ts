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
export type BillingInterval = "monthly" | "yearly";
export declare const BILLING_INTERVALS: readonly BillingInterval[];
export declare function isBillingInterval(value: unknown): value is BillingInterval;
/**
 * A per-period allowance on one meter of the usage ledger, in that meter's
 * unit (micros for a money meter, a count otherwise).
 *
 * `resets: false` makes it a lifetime allowance — BlastCP's Free image credit
 * is spent once, not refilled monthly, because a free workspace that refills
 * forever is a free image API.
 */
export interface Allowance {
    amount: number;
    resets?: boolean;
}
export interface BasePlan<P extends string = string> {
    id: P;
    name: string;
    /** Per seat (when `perSeat`) or per workspace, per MONTH, in cents. */
    monthlyUnitAmountCents: number;
    /** Billed per seat (quantity = seats) vs one fixed workspace price. */
    perSeat: boolean;
    /** Metered allowances, keyed by meter name. Absent = no allowance (0). */
    allowances?: Readonly<Record<string, Allowance>>;
}
export interface CatalogSpec<P extends string, T extends BasePlan<P>> {
    plans: Readonly<Record<P, T>>;
    /** Cheapest first. Decides what counts as an upgrade, and display order. */
    order: readonly P[];
    /** The plan an org with no subscription — or an unknown plan id — is on. */
    free: P;
    /** Months charged for a yearly term. 10 = "two months free". */
    yearlyMonthsCharged?: number;
}
export interface Catalog<P extends string = string, T extends BasePlan<P> = BasePlan<P>> {
    readonly plans: Readonly<Record<P, T>>;
    readonly order: readonly P[];
    readonly free: P;
    readonly yearlyMonthsCharged: number;
    /** Paid plans, cheapest first — what Stripe needs a price id for. */
    readonly paid: readonly P[];
    /** Unknown or missing id → the free plan: the direction that under-grants. */
    get(id: string | null | undefined): T;
    isPlanId(value: unknown): value is P;
    isUpgrade(from: P, to: P): boolean;
    /** Per-seat (or per-workspace) price for one interval, in cents. */
    priceCents(plan: P, interval: BillingInterval): number;
    /** Total per interval for `seats` seats. Free is free at any headcount. */
    totalCents(plan: P, interval: BillingInterval, seats: number): number;
    /** What a yearly term saves against twelve monthly payments, in cents. */
    yearlySavingsCents(plan: P, seats?: number): number;
    /** The plan's allowance on a meter; `null` when the plan has none. */
    allowance(plan: P, meter: string): Allowance | null;
}
export declare function defineCatalog<P extends string, T extends BasePlan<P>>(spec: CatalogSpec<P, T>): Catalog<P, T>;
/** "per person, per month" — the cadence line under a price. */
export declare function cadenceLabel(plan: BasePlan, interval: BillingInterval): string;
