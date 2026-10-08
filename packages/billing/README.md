# @aimhuge/billing

Plans, subscriptions, Stripe, invoices, and a metered-usage ledger, shared by
DeckCP, BlastCP and whatever comes next. Extracted from DeckCP's billing module
(which had the Stripe adapter, webhook, mock provider and proration) and
generalized so BlastCP's per-workspace image credit runs on the same tables.

## What the package owns, and what the app keeps

| The package | The app |
|---|---|
| Catalog arithmetic: prices, seats, yearly terms, upgrades, allowances | The catalog itself: its plans, prices, and whatever it gates on |
| The provider seam, the Stripe adapter, the mock (test billing) | Its billing pages and server actions |
| The Stripe webhook as a Fetch handler | The 3-line route that mounts it |
| The Supabase mirror: subscriptions, invoices, cards, profile, audit log | The Supabase client, and the auth gate in front of every call |
| The usage ledger: balance, `assertCanAfford`, `recordUsage`, grants | What a meter means and where the charge happens |
| The SQL (`sql/`) | Copying it into its own migrations; any app-specific triggers |
| `onPlanChange` and comps (`setPlanByAdmin`) | What a tier change must refresh (DeckCP's deck caches) |

## Install

```bash
pnpm add "@aimhuge/billing@github:aimhuge/components#vX.Y.Z&path:/packages/billing"
```

The repo is public, so no credentials are needed anywhere (local, Vercel, CI).
That also means nothing account-specific belongs in this package: Stripe keys,
price ids and webhook secrets live in each app's environment. Three entry
points:

- `@aimhuge/billing`: pure and client-safe (catalog, money, periods, types).
  A client plan picker can import `previewChangeCents` from here.
- `@aimhuge/billing/server`: everything that touches Supabase or Stripe. Opens
  with `import "server-only"`, so a client import fails the build.
- `@aimhuge/billing/test-cards`: the mock's browser-side card tokenizer.

**Vitest in the app** must inline the package so the app's `server-only` stub
applies to it too (Node can't load the real one):

```ts
test: { server: { deps: { inline: [/@aimhuge\//] } } }
```

## Setup

**1. Schema.** Copy `sql/0001_billing.sql` and `sql/0002_usage_ledger.sql` into
`supabase/migrations/` under new timestamps and apply them. Both are idempotent
(`create … if not exists`), so 0001 is a no-op where the tables already exist.
They assume the shared workspace model: `orgs(id)`, `org_memberships(org_id,
user_id, role, created_at)`, `profiles(id, email)`. Every table is RLS-on with
no policies, reachable only by the service role.

**2. Catalog.** Plans carry the pricing fields the package needs (`BasePlan`)
plus whatever the app gates on:

```ts
// src/lib/billing/plans.ts — client-safe
import { defineCatalog, type BasePlan } from "@aimhuge/billing";

export type PlanId = "free" | "pro" | "team";
export interface Plan extends BasePlan<PlanId> { removesBranding: boolean }

export const catalog = defineCatalog<PlanId, Plan>({
  plans: {
    free: { id: "free", name: "Free", monthlyUnitAmountCents: 0, perSeat: false, removesBranding: false },
    pro:  { id: "pro",  name: "Pro",  monthlyUnitAmountCents: 1600, perSeat: true, removesBranding: true },
    team: { id: "team", name: "Team", monthlyUnitAmountCents: 2400, perSeat: true, removesBranding: true },
  },
  order: ["free", "pro", "team"],   // cheapest first
  free: "free",
  yearlyMonthsCharged: 10,          // "two months free"
});
```

**Gate on a capability or a limit, never on a plan id.** `plan === "pro"` is
how a new top tier ends up treated as unpaid: `catalog.get(id).removesBranding`.

**3. Billing.**

```ts
// src/lib/billing/billing.ts — server-only
import { createBilling } from "@aimhuge/billing/server";

export const billing = createBilling({
  app: "deckcp",                 // stamped on every Stripe object as metadata.app
  displayName: "DeckCP",
  url: "https://deckcp.com",
  catalog,
  invoicePrefix: "DCP",          // DCP-2026-0001
  onPlanChange: ({ service, orgId }) => invalidateOrgDeckCaches(service, orgId),
});
```

**4. Webhook route.**

```ts
// src/app/api/billing/webhook/route.ts
export const POST = (req: Request) => billing.handleStripeWebhook(req, getSupabase);
```

**5. Environment** (all server-only):

| Variable | |
|---|---|
| `BILLING_PROVIDER` | `stripe` to charge real cards. Anything else runs the mock. |
| `STRIPE_SECRET_KEY` | `sk_test_…` / `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` of THIS app's endpoint |
| `STRIPE_PRICE_<PLAN>_<INTERVAL>` | One per paid plan × `MONTHLY`/`YEARLY`, e.g. `STRIPE_PRICE_PRO_MONTHLY` |
| `NEXT_PUBLIC_SITE_URL` | Origin for Checkout and portal return URLs |

A missing variable throws on first use with the whole list. Create the Stripe
prices to MATCH the catalog (per-unit recurring prices, seats ride on
`quantity`). Nothing reconciles them, so a mismatch is a real bug.

## What `billing` gives an app

Every method takes the service-role client first; the app's own gate runs
before it.

| | |
|---|---|
| `provider()` | The active provider: checkout, plan change, cancel/resume, cards, portal, `reconcile` |
| `subscription(svc, org)` | Created Free on first read; a lapsed free/comped period rolls forward |
| `account(svc, org)` | Subscription, invoices (24), cards, billing profile, member count, owner email |
| `invoice(svc, org, number)` | One receipt by its human number, org-scoped (`null` if not theirs) |
| `profile` / `saveProfile` | The invoice addressee; `saveProfile` validates email + country (a `BillingError` the customer can read) and trims |
| `setPlanByAdmin(svc, …)` | An operator's comp; refuses a live Stripe subscription |
| `balance` / `assertCanAfford` / `recordUsage` / `grantCredit` | The usage ledger |
| `handleStripeWebhook(req, getService)` | The webhook as a Fetch handler |
| `saveSubscription`, `logEvent` | Low-level; providers and comps use them |

## One Stripe account, many apps

Every customer, Checkout session and subscription is stamped with
`metadata.app`. Each app's webhook acknowledges (200) and drops an event
stamped for another app *before* claiming it or reading anything. Without that,
BlastCP's prices would be unknown to DeckCP's webhook, and every BlastCP event
would 500 there and be retried for three days. Give each app its own webhook
endpoint (and so its own `STRIPE_WEBHOOK_SECRET`).

**Branding.** The account's dashboard branding is the company's. An app that
wants Checkout to show its own name and logo passes `checkoutBranding` to
`createBilling`; every Checkout session it opens overrides the dashboard with
it (Stripe's `branding_settings`). The package carries no brand — each app
passes its own, and one that passes nothing gets the dashboard's:

```ts
createBilling({
  app: "deckcp", displayName: "DeckCP", catalog, invoicePrefix: "DCP",
  checkoutBranding: { displayName: "DeckCP", logoUrl: "https://deckcp.com/logo.png", buttonColor: "#4f46e5" },
});
```

A bad value (a logo AND an icon, a non-https URL, a non-hex color) throws when
billing is created, not at someone's Checkout. Only Checkout can be branded per
app: receipts, invoice emails, the customer portal and the card statement carry
the account's branding. An app that needs those to be its own needs its own
Stripe account (one organization can hold several).

## Rules that are easy to break

- **Money is integers.** Cents for everything Stripe charges (prices,
  invoices). Micro-dollars for metered usage, because a $0.00317 image rounds to
  free in cents. Names carry the unit (`_cents`, `Micros`).
- **Never recompute a price at read time.** A subscription freezes its unit
  price at purchase; an invoice freezes its totals. A catalog edit changes
  what new purchases cost, nothing else.
- **A tier change is a subscription change.** Go through the provider or
  `setPlanByAdmin`. An app that mirrors the tier onto another column (DeckCP's
  `orgs.plan`) does it with a database trigger, never a second write.
- **The webhook is the authority.** The adapter mirrors eagerly so the UI
  updates on click, but renewals, portal edits and dunning arrive only there.
  `?checkout=done` is a hint; `provider.reconcile(ctx)` re-reads Stripe.
- **A card number never reaches a server.** The mock tokenizes in the browser;
  Stripe takes cards on its own pages (`managesPaymentMethodsExternally`).
- **Charging an operator's way out.** `setPlanByAdmin` refuses a live Stripe
  subscription (its webhook would revert the edit). Apps exclude their
  super-admin "god view" from billing mutations: viewing is fine, charging
  someone else's card is not.

## Periods and the usage ledger

A free or comped ($0) subscription has nothing upstream to renew it, so its
lapsed period **rolls forward on read** (`rollForward`, anchored on the
original day so a 31st survives February). The usage allowance resets with it.
A paid period is never rolled here: Stripe moves it via the webhook, and the
mock deliberately doesn't bill renewals.

Balance = the plan's allowance + unexpired grants − usage in the window. The
window is the current period, or all time for `resets: false` (BlastCP's Free
image credit is spent once, not refilled). The sum runs in Postgres
(`org_usage_total`), because a client-side sum stops at PostgREST's row cap.
Allowances follow payment: a status outside `meteredStatuses` spends on the
free plan's allowance.

```ts
await billing.assertCanAfford(service, orgId, "image_credit", priceMicros); // throws InsufficientCredit
const media = await generate();                                              // the work that costs money
await billing.recordUsage(service, { orgId, meter: "image_credit", amount: priceMicros,
  costMicros, refType: "media", refId: media.id, createdVia: "mcp" });
```

Two simultaneous charges can both pass the check and overdraw by one charge.
That race is accepted. Reserving and refunding instead charges people whose
work then failed, or leaks a reservation when a process dies mid-call.

## Testing

```bash
pnpm test                 # unit + an in-memory Supabase stand-in
pnpm test:stripe-live     # real Stripe TEST mode, needs keys; refuses a live key
```

## Not built

- **Mock renewals.** A lapsed paid mock period isn't billed again.
- **Tax.** The mock writes `tax_cents = 0` explicitly; Stripe reports what Stripe
  Tax computes (zero until it's enabled).
- **Dunning from us.** Stripe retries and emails. A failed payment leaves the
  subscription `past_due` with an open invoice, and access is not revoked.
- **Selling metered usage through Stripe.** Grants are how credit is added
  today; a bought bundle would be a one-off Checkout that calls `grantCredit`.
