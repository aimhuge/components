# Conventions

How `@aimhuge/<name>` packages are built. Read this first, then the README of
the package closest to what you're building. This page is the index: the
per-package READMEs are the deep reference, and this page doesn't restate them.

| Package | Pattern | README |
|---|---|---|
| `@aimhuge/auth` | Pure types + utilities, Next.js route factories | [packages/auth/README.md](packages/auth/README.md) |
| `@aimhuge/teams` | Supabase service-role + SQL | [packages/teams/README.md](packages/teams/README.md) |
| `@aimhuge/billing` | Stripe / payments adapter | [packages/billing/README.md](packages/billing/README.md) |
| `@aimhuge/slack` | Web API client | [packages/slack/README.md](packages/slack/README.md) |
| `@aimhuge/share` | Pure types + utilities, UI over them, a small server entry | [packages/share/README.md](packages/share/README.md) |
| `@aimhuge/admin` | UI chrome over `@aimhuge/teams` (see [the exception](#1-peerdependencies-only)) | [packages/admin/README.md](packages/admin/README.md) |

## The five patterns

Most new packages are one of these, or two of them stacked. Find the closest
one, open its example, and copy its shape.

**Which one?**

- It's pure logic, no I/O, safe on the client → **1. Pure types + utilities**
- It owns tables and reads/writes them with the service role → **2. Supabase service-role + SQL**
- It charges money or meters usage → **3. Payments adapter**
- It wraps a third party's HTTP API, with inbound webhooks/events → **4. Web API client**
- It hands the app a `GET`/`POST` for an `app/**/route.ts` → **5. Route factories**

### 1. Pure types + utilities

The root entry (`.`) of every package: no `next/headers`, no Supabase, no
`process.env`. Safe in a client component, a server component, or a test.

- Example: `@aimhuge/auth` root, `safeNextPath` and `identityFromUser`.
  See [auth entry points](packages/auth/README.md#entry-points).
- Also: `@aimhuge/billing` root (catalog, money, periods), `@aimhuge/slack`
  root (mrkdwn, webhook-URL masking), `@aimhuge/teams/roles`.
- Rule: if the root re-exports anything server-only, add a separate pure
  subpath for client components. Teams learned this the hard way; see
  [teams step 5](packages/teams/README.md#wiring-an-app) ("Client components
  import `@aimhuge/teams/roles`, never the root").

### 2. Supabase service-role + SQL

The package owns a set of tables and the functions over them. The app builds
the clients and passes them in, and the app's gate runs before any query.

- Example: `@aimhuge/teams`, `TeamClients` (`{ service, ssr }`) in
  `packages/teams/src/server/gate.ts`, and the schema in
  `packages/teams/src/sql/0001_orgs_and_memberships.sql` and
  `0002_invitations.sql`. See [teams schema](packages/teams/README.md#schema).
- SQL files are numbered `NNNN_<what>.sql`, idempotent (`create … if not
  exists`), and RLS-on with **no policies**, so only the service role can reach them.
  Apps copy them into their own `supabase/migrations/` under new timestamps.
- Every function takes the service-role client as its **first argument**
  (`listOrgMembers(service, orgId)`, `billing.balance(service, orgId, …)`).
- Where the SQL lives: billing and slack ship it in `sql/` with a `"./sql/*"`
  export. Teams keeps it in `src/sql/`, which isn't exported. For a new package,
  follow billing/slack.

### 3. Stripe / payments adapter

A provider seam with interchangeable adapters, a webhook as a Fetch handler,
and a mirror in Supabase.

- Example: `@aimhuge/billing`. A `mock` adapter (the default unless
  `BILLING_PROVIDER=stripe`) and a `live` Stripe adapter behind one
  `provider()`, plus the metered usage ledger (`assertCanAfford` →
  work → `recordUsage`).
- Read: [the rules that are easy to break](packages/billing/README.md#rules-that-are-easy-to-break)
  (integer money, frozen prices, the webhook is the authority), and
  [one Stripe account, many apps](packages/billing/README.md#one-stripe-account-many-apps)
  (`metadata.app` stamping).
- Shape: one factory (`createBilling({ app, catalog, … })`) returns the whole
  API, so the app's config is bound once.

### 4. Web API client

One fetch wrapper that knows the vendor's error shape, plus inbound request
verification, plus the install/OAuth dance.

- Example: `@aimhuge/slack`. `callSlack` for the Web API, `readSlackRequest`
  / `verifySlackRequest` for the Events API (HMAC + replay window), and
  Add to Slack for the install.
- Read: [the rules it encodes](packages/slack/README.md#the-rules-it-encodes)
  (a timed-out write may have landed, link by proof not by email, webhook
  URLs are secrets).
- The app owns the routes. The package gives each route a few lines to call
  (see [slack setup step 3](packages/slack/README.md#setup)).

### 5. Next.js route factories

`createX(options)` returns a handler the app exports as `GET`/`POST` in its own
`app/**/route.ts`. The app keeps the URL, and the package owns the behaviour.

- Example: `@aimhuge/auth/server`, `createAuthCallback`, `createAuthConfirm`,
  `createGoogleStart` / `createGoogleCallback`.
  See [auth wiring step 2](packages/auth/README.md#wiring-an-app).
- App-specific side effects are passed in as a callback (`onSignedIn`), and
  they run best-effort: a throw is logged and the redirect still happens.
- Same idea in billing: `billing.handleStripeWebhook(req, getService)` is a
  Fetch handler the app mounts in a 3-line route.

## File layout

The skeleton is described once, in the root
[README "Adding a package"](README.md#adding-a-package). What all five
packages agree on:

```
packages/<name>/
  package.json          name "@aimhuge/<name>", "type": "module", exports → dist/
  tsconfig.json         typecheck (extends ../../tsconfig.base.json)
  tsconfig.build.json   build: rootDir src, outDir dist, excludes tests
  vitest.config.ts
  README.md             see "What the package owns" below
  src/
    index.ts            the pure root entry
    client/index.ts     "use client" modules (when there is UI)
    server/index.ts     opens with import "server-only" (when there is I/O)
  dist/                 compiled JS + .d.ts, COMMITTED, because apps install from a tag
  sql/                  NNNN_*.sql, when the package owns tables
```

- `package.json` scripts are identical across packages: `build` (wipe `dist/`,
  then `tsc -p tsconfig.build.json`), `typecheck` (`tsc --noEmit`), `test`
  (`vitest run`).
- `"files"` lists exactly what ships: `dist`, `README.md`, and `sql` / `*.css`
  if exported.
- `"sideEffects": false`, except for a package that ships CSS (auth:
  `["*.css"]`).
- Runtime `dependencies` are rare. Billing's `stripe` is the only one, because
  no app already has it. Everything an app already has is a peer.

## How packages talk

### 1. peerDependencies only

A package never bundles what the app already has (`next`, `react`,
`@supabase/supabase-js`, `@supabase/ssr`, `lucide-react`). Those are
`peerDependencies` with a loose floor (`>=16.0.0`, `^2.0.0`), and the exact
version goes in `devDependencies` for tests.

**Never import one `@aimhuge` package from another.** When two packages need
the same concept, the app wires them together.

The exception: `@aimhuge/admin` peer-depends on `@aimhuge/teams` to re-use
`isSuperAdmin`, so one `SUPER_ADMIN_EMAILS` governs both (see
[admin README](packages/admin/README.md)). It's a declared peer and never
a regular dependency or a relative path. Don't add a second one without a
reason that strong.

### 2. Apps inject deps in

The package declares what it needs, and the app hands it over. A package never
builds its own Supabase client, never sends its own email, and never reads an
env var its README doesn't list.

- **Clients as arguments.** `requireOrg({ service, ssr }, orgSlug)` takes
  `TeamClients`, and every billing method takes `service` first.
- **Configure once at startup.** `configureTeamActions({ clients, email,
  appName, onMembershipChanged })` lets server actions called from client
  components find their deps without prop-drilling. `createBilling({ … })`
  and auth's `createAuthCallback({ onSignedIn })` do the same job as
  factories.
- **Transports and hooks, not implementations.** Teams takes an
  `InviteEmailTransport` (the app's own `sendEmail`). Billing takes
  `onPlanChange`, and teams takes `onMembershipChanged` and `assertSeatRoom`.
- **Env is declared, in a table, in the README.** Auth reads
  `NEXT_PUBLIC_SUPABASE_*`, billing reads `STRIPE_*` through an injectable
  `env` (defaults to `process.env`, and tests pass their own), slack reads
  `SLACK_*` through `slackAppConfig()`, and teams reads `SUPER_ADMIN_EMAILS`.
  A missing variable throws on first use, naming all of them
  ([billing env](packages/billing/README.md#setup)).
- The repo is **public**, so nothing account-specific (keys, price ids,
  webhook URLs) ever lives in a package.

### 3. Every entry point is a subpath in `exports`

Apps import only what `exports` lists. There are no deep imports into `dist/`.

| Subpath | Holds | Who has it |
|---|---|---|
| `.` | Pure, client-safe | all |
| `./client` | `"use client"` components and hooks | auth, teams, admin |
| `./server` | `import "server-only"`, I/O | all |
| `./roles`, `./columns`, `./test-cards` | A narrower pure slice | teams, admin, billing |
| `./sql/*` | Raw SQL files to copy | billing, slack |
| `./auth.css` | Tokens + Tailwind `@source` | auth |

Apps that render a package's components in vitest must inline it:
`test.server.deps.inline: [/@aimhuge\//]` (every README's Gotchas/Install).

## What the package owns, and what the app keeps

Every package README has this section near the top, as a two-column table.
**Follow this structure in every new package's README.** The template is
auth's:

| Package | App |
|---|---|
| `useLoginFlow`: the sign-in behaviour with no UI; `LoginForm`: its default look | The `/login` page itself: header, card, copy, brand |
| `SignedInPrompt`: the "already signed in as …" banner | Where a signed-in visitor goes by default |
| `createAuthCallback` / `createAuthConfirm`: the route handlers | What to record after sign-in (`onSignedIn`) |
| `getSupabaseServer` / `getSupabaseBrowser`, `useAuth`, `readSessionIdentity` | The Proxy that refreshes the session |
| `safeNextPath`: the one `?next=` sanitizer | Analytics identify, which is product-specific |

Each row pairs a thing the package ships with the decision it leaves to the
app. The left column has code names, and the right column has the app's
choices: copy, brand, routes, which events, what a side effect means.

Examples:
[auth](packages/auth/README.md#what-the-package-owns-and-what-the-app-keeps) ·
[teams](packages/teams/README.md#what-the-package-owns-and-what-the-app-keeps) ·
[billing](packages/billing/README.md#what-the-package-owns-and-what-the-app-keeps) ·
[slack](packages/slack/README.md#what-the-package-owns-and-what-the-app-keeps) ·
[admin](packages/admin/README.md#what-the-package-owns-and-what-the-app-keeps)

After that table, the READMEs follow roughly the same order: entry points →
install → wiring an app (numbered steps with code) → rules/gotchas → developing.

## Release flow

Build, commit `dist/`, tag, and push. The steps are in the root
[README "Releasing"](README.md#releasing). Tags are repo-wide (`v0.7.0` covers
every package) and are never moved.

Installing in an app, and trying an unreleased branch, are in
[README "Installing a package in an app"](README.md#installing-a-package-in-an-app)
and [README "Developing"](README.md#developing).

**Extracting a package out of an app** (from the blastcp teams extraction,
`4e36dc9`): while you build the package, point the app at your working copy
with `link:../components/packages/<name>`. **After the new package is wired
into an app, switch the app's `link:../components/packages/<name>` to
`github:aimhuge/components#vX.Y.Z&path:/packages/<name>` and commit that in a
separate change.** That way the "move code into the package" commit and the
"depend on a released tag" commit can each be reviewed and reverted alone, and
a `link:` never reaches Vercel, where `../components` doesn't exist.

## Starting a new extraction: checklist

1. Pick the pattern(s) above, and open that package's README and `src/`.
2. Write the README's owns/keeps table **first**. That table is the design
   proposal.
3. List the env vars and injected deps (clients, transports, hooks).
4. Lay out `exports`: `.` pure, plus `./client` / `./server` as needed.
5. Build with `link:` in the app, then release, then switch to the tag
   (see [Release flow](#release-flow)).
