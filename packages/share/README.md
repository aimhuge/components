# @aimhuge/share

Share links for the AimHuge apps: the access modes and the three questions the
Share dialog asks about them, the email/password gate with its signed pass
cookie, share-password hashing, and the Share dialog UI. Extracted from
DeckCP's deck sharing, so Weft can share threads and pages the same way.

The package doesn't know what's being shared. The app brings the resource (a
deck, a thread, a page), its routes, its storage, and anything specific to it
(DeckCP's per-person grants, slide picker for link previews, comments).

## What the package owns, and what the app keeps

| Package | App |
|---|---|
| `ShareMode` and its rules: `linkGrantsRead`, `linkGrantsEdit`, `modeHasGate` | Where the mode is stored (`decks.share_mode`, a `shares` row), and who may change it |
| `toAxes` / `toMode` / `withAxis`: the three questions (who, level, gate) over the mode, never widening access by accident | Whether strangers may edit at all (`allowEdit={false}` for Weft's threads) |
| `createShareGate`: the signed, self-verifying pass cookie; `hasGatePass` / `grantGatePass` | The signing secret and what happens when it's missing (`secret` returns null → refuse) |
| `hashSharePassword` / `verifySharePassword` (scrypt, salt embedded) | The unlock route: reading the body, checking the password or recording the email, rate limits |
| `<ShareGateForm>`: the full-page unlock prompt | Its title, the noun, the routes it posts to, analytics on unlock (`onUnlocked`) |
| `<ShareDialog>`, `<ShareAccessFields>`, `<CopyLinkButton>`, `<ToggleRow>`, `useShareAccess` | The trigger button, the dialog's other sections (people, link preview), the save request, the share URLs |
| `share.css`: the `share-*` colour tokens, defaulting to DeckCP's dark dialog | The accent (`bg-accent`, `text-accent`) and any `--share-*` overrides for its surface |

## Entry points

| Import | Holds |
|---|---|
| `@aimhuge/share` | Pure: modes, axes, labels, `consequenceOf`. Safe in client and server code. |
| `@aimhuge/share/client` | `"use client"` UI and the `useShareAccess` hook. |
| `@aimhuge/share/server` | `node:crypto` and `next/headers`: the gate pass, password hashing. |
| `@aimhuge/share/share.css` | Tailwind `@source` for the components plus the `share-*` tokens. |

## Wiring an app

1. **Install** from a tag:
   ```bash
   pnpm add "@aimhuge/share@github:aimhuge/components#vX.Y.Z&path:/packages/share"
   ```
   While developing against a working copy, use `file:../components/packages/share`,
   not `link:`. Turbopack doesn't resolve files outside the project root, and a
   `link:` also resolves `react` and `@types/react` from the components
   workspace, which breaks types. With `file:`, pnpm copies the package into
   the app and its peers resolve from the app (re-run `pnpm install` after
   each `pnpm build` here).

2. **Styles.** In the global stylesheet, after Tailwind:
   ```css
   @import "tailwindcss";
   @import "@aimhuge/share/share.css";
   ```
   The app's theme provides `--color-accent`. On a light surface, override
   the `--share-*` variables listed at the top of `share.css`.

3. **The gate**, once, server side:
   ```ts
   import { createShareGate } from "@aimhuge/share/server";

   export const gate = createShareGate({
     cookiePrefix: "deck_gate_",
     // Null in production when unset: the gate then refuses rather than
     // signing with a published constant.
     secret: () => process.env.SHARE_GATE_SECRET ?? (process.env.NODE_ENV === "production" ? null : "dev"),
     nameSecret: () => process.env.SHARE_GATE_SECRET ?? "dev",
   });
   ```
   The unlock route checks the password (`verifySharePassword`) or records the
   email, then `await grantGatePass(gate, id)`. The viewer checks
   `await hasGatePass(gate, id)` before rendering a gated resource, and
   otherwise renders `<ShareGateForm unlockUrl=… />`.

4. **The dialog**, client side:
   ```tsx
   const access = useShareAccess({
     save: async (next, password) => {
       const res = await fetch(`/api/things/${id}/share`, {
         method: "PUT",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ shareMode: next.mode, editRequiresEmail: next.editRequiresEmail, password }),
       });
       return res.ok ? { ok: true } : { ok: false, error: (await res.json().catch(() => ({}))).error };
     },
   });
   // After your GET: access.hydrate({ shareMode, editRequiresEmail, hasPassword })

   {open && (
     <ShareDialog title={`Share “${title}”`} onClose={close}
       headerAction={<CopyLinkButton size="sm" url={shareUrl} />}
       footerStart={<CopyLinkButton url={shareUrl} />}>
       <ShareAccessFields s={access} noun="thread" allowEdit={false} />
     </ShareDialog>
   )}
   ```
   An app with its own state can pass anything shaped like
   `ShareAccessControls` as `s`. DeckCP's `useShareDialog` spreads
   `useShareAccess` into a bigger object and passes that.

## Rules it encodes

- **Fail closed.** No signing secret means no pass is minted and none is
  accepted. Unset env must never mean "trust a public constant".
- **Opening up lands on the email gate.** Private → link without picking a
  gate becomes "Their email address", not wide open: the link works, and the
  owner can see who opened it.
- **Unrepresentable combinations close, never open.** Edit + password becomes
  edit + email; private keeps the edit gate on, so re-opening can't land on
  anonymous editing.
- **A refused save snaps the controls back.** An access control showing a
  setting the server didn't save is worse than an error.
- **Stable cookie names.** `cookieName` hashes the id with `nameSecret`, which
  must not change: a new name re-gates every visitor. DeckCP's names and passes
  are byte-identical to what they were before the extraction (pinned in
  `gate.test.ts`).

## Gotchas

- **Escape is the dialog's.** `<ShareDialog>` closes on Escape. Don't also
  listen in the app, or close runs twice.
- **Tests in an app** that render these components inline the package:
  `test.server.deps.inline: [/@aimhuge\//]`.
- **Cache Components.** A page that reads `searchParams` to pick a gate
  reads it inside `<Suspense>`.

## Developing

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build     # writes dist/, which IS committed — apps install from a git tag
```
