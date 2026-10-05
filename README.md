# aimhuge/components

Shared modules for the AimHuge apps: DeckCP, BlastCP, and whatever comes next. Each package under `packages/` is its own npm package with its own dependencies. An app installs only what it uses, so installing auth never pulls in Stripe.

| Package | What it is |
|---|---|
| [`@aimhuge/auth`](packages/auth/README.md) | Supabase sign-in: the login form, the signed-in banner, `/auth/callback` + `/auth/confirm`, session helpers |
| [`@aimhuge/billing`](packages/billing/README.md) | Plans, subscriptions, Stripe (checkout, portal, webhook), the mock, invoices, and a metered-usage ledger |

## Installing a package in an app

Apps install straight from a git tag, with a path into the workspace:

```bash
pnpm add "@aimhuge/auth@github:aimhuge/components#v0.1.0&path:/packages/auth"
```

The repo is public, so this needs no key or token anywhere: not on a laptop, not on Vercel, not in CI. pnpm fetches the tag's tarball from GitHub and takes the package's directory. Keep secrets, customer data and anything unreleased out of it.

Every package ships compiled `dist/` (JS + `.d.ts`), committed in the tag. So an app needs no `transpilePackages`, and its `tsc` never type-checks our source.

To upgrade, change the tag in the app's `package.json` and run `pnpm install`.

## Releasing

```bash
pnpm build                       # rebuild dist/, commit it with the change
bash scripts/release.sh 0.2.0    # checks, refuses a stale dist/, tags v0.2.0, pushes
```

Tags are repo-wide (`v0.2.0` covers every package), and a published tag is never moved. Each package's own `version` field records the release that last changed it.

## Adding a package

`packages/<name>/` with its own `package.json` (`"name": "@aimhuge/<name>"`, an `exports` map into `dist/`, `peerDependencies` for whatever the app already has: next, react, supabase), a `build` script that writes `dist/`, and a README that says what the package owns and what the app keeps. Root config is shared, so change it in its own commit.

## Developing

```bash
pnpm install
pnpm test        # every package
pnpm typecheck
```

To try an unreleased change in an app, push a branch and point the app at it (`#my-branch&path:/packages/auth`). Then switch back to a tag before merging the app.
