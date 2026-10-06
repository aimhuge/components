# @aimhuge/auth

Supabase sign-in for the AimHuge Next.js apps: Google OAuth and magic links, no passwords. One copy of the sign-in flow instead of a fork per app.

## What the package owns, and what the app keeps

| Package | App |
|---|---|
| `useLoginFlow`: the sign-in behaviour with no UI (guest upgrade, desktop-shell round trip, the loop guard); `LoginForm`: its default look | The `/login` page itself: header, card, copy, brand, and its own form if it wants one |
| `SignedInPrompt`: the "already signed in as …" banner, and its sign-out action | Where a signed-in visitor goes by default (orgs, last-visited cookie, …) |
| `createAuthCallback` / `createAuthConfirm`: the `/auth/callback` and `/auth/confirm` handlers | What to record after sign-in (`onSignedIn`: login stats, invites) |
| `getSupabaseServer` / `getSupabaseBrowser`, `useAuth`, `readSessionIdentity` | The Proxy that refreshes the session on every request |
| `safeNextPath`: the one `?next=` sanitizer | Analytics identify, which is product-specific |

## Entry points

- `@aimhuge/auth`: pure, safe anywhere. `safeNextPath`, `identityFromUser`, and the `SessionIdentity` and `DesktopAuth` types.
- `@aimhuge/auth/client`: `"use client"` modules. `useLoginFlow`, `LoginForm`, `SignedInPrompt`, `useAuth`, `getSupabaseBrowser`. A Server Component may import these; it gets client references.
- `@aimhuge/auth/server`: `getSupabaseServer`, `createAuthCallback`, `createAuthConfirm`, `createGoogleStart` + `createGoogleCallback` (Google on your own domain, below), `readSessionIdentity`, and `signOutAndRedirect` (a server action).
- `@aimhuge/auth/auth.css`: the `auth-*` colour tokens, plus the `@source` that makes Tailwind generate the components' classes.

## Wiring an app

Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

1. **Styles.** In the global stylesheet, right after Tailwind:

   ```css
   @import "tailwindcss";
   @import "@aimhuge/auth/auth.css";
   ```

   Then set any `--auth-*` variable whose default doesn't suit the card (see auth.css). The defaults are the shell tokens: `--foreground`, `--muted`, `--card-bg`. The accent (`bg-accent`, `text-accent-ink`, `hover:bg-accent-hover`) and `font-display` come from the app's own theme.

2. **Routes.**

   ```ts
   // app/auth/callback/route.ts
   import { createAuthCallback } from "@aimhuge/auth/server";
   export const GET = createAuthCallback({ defaultNext: "/app" });

   // app/auth/confirm/route.ts
   import { createAuthConfirm } from "@aimhuge/auth/server";
   export const GET = createAuthConfirm({ defaultNext: "/app" });
   ```

   Pass `onSignedIn: async ({ request, supabase, user }) => { … }` for anything the app records after sign-in. It's best-effort: a throw is logged and the redirect still happens.

3. **The form.** Wrap it once on the client to bind the app's options. A desktop adapter holds functions, which can't cross from a Server Component:

   ```tsx
   "use client";
   import { LoginForm as Base } from "@aimhuge/auth/client";
   export function LoginForm() {
     return <Base defaultNext="/app" />;
   }
   ```

4. **The page.** Keep the app's own chrome, and inside a `<Suspense>`:

   ```tsx
   import { safeNextPath } from "@aimhuge/auth";
   import { SignedInPrompt } from "@aimhuge/auth/client";
   import { readSessionIdentity } from "@aimhuge/auth/server";

   async function LoginBody({ searchParams }) {
     const [{ next }, identity] = await Promise.all([searchParams, readSessionIdentity()]);
     return (
       <>
         {identity && <SignedInPrompt identity={identity} next={safeNextPath(next, "/app")} />}
         <LoginForm />
       </>
     );
   }
   ```

   `readSessionIdentity` is uncached. To prerender the page shell, wrap it in the app's own `"use cache: private"` function.

5. **The hook.** Re-export it bound to the app's options, so call sites stay `useAuth()`:

   ```ts
   // lib/hooks/useAuth.ts
   "use client";
   import { useAuth as useAimhugeAuth } from "@aimhuge/auth/client";
   export const useAuth = () => useAimhugeAuth();
   ```

## Your own form

How headless this is: the route handlers, session helpers, sign-out action and `useAuth` render nothing. `LoginForm` and `SignedInPrompt` are a fixed layout and copy, restyled only through the `--auth-*` colours. For a different form, skip `LoginForm` and drive `useLoginFlow` directly. It takes the same options and owns all the behaviour, so a custom form can't drop the guest upgrade, the desktop round trip or the `signin=force` loop guard:

```tsx
"use client";
import { useState } from "react";
import { useLoginFlow } from "@aimhuge/auth/client";

export function MyLoginForm() {
  const { busy, error, sentTo, awaitingBrowser, signInWithGoogle, sendMagicLink, reset } =
    useLoginFlow({ defaultNext: "/app" });
  const [email, setEmail] = useState("");

  if (sentTo) return <p>Check {sentTo}. <button onClick={reset}>Use another email</button></p>;
  if (awaitingBrowser) return <p>Finish in your browser. <button onClick={reset}>Try again</button></p>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); void sendMagicLink(email); }}>
      <button type="button" disabled={busy !== null} onClick={() => void signInWithGoogle()}>Google</button>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button disabled={busy !== null || !email}>Send link</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

`busy` is `"google"`, `"email"` or `null`. After a successful Google handoff on the web it stays `"google"` until the page leaves, so the button doesn't flick back to idle mid-redirect. Like `LoginForm`, the component must sit inside `<Suspense>` because the hook reads `useSearchParams`.

## Options that change behaviour

- **`linkAnonymous`** (LoginForm). For apps that hand out anonymous guest sessions before sign-in. Google is linked onto the guest's account instead of replacing it, so whatever they made stays theirs. A refused link (that Google account already belongs to someone) comes back through `/auth/callback` as `signin=force`, and the form then signs in plainly. The retry can't loop.
- **`desktop: DesktopAuth`** (LoginForm, `useAuth`). For an app with an Electron shell. Google refuses OAuth inside an embedded webview, so in the shell the authorize URL opens in the system browser (`skipBrowserRedirect` + `openExternal`) and every redirect target becomes `desktop.redirectTo(next)`, a page that hands the round trip back to the app. `isDesktop()` is read at click time only, never during render, because the server render has no `window`.

## Google on your own domain

Supabase's hosted Google flow sends Google back to `<ref>.supabase.co/auth/v1/callback`, so that host must be an **authorized domain** on the Google Cloud project. That's harmless until the same project asks for sensitive scopes (YouTube, Gmail): verification wants you to own every authorized domain, and you don't own `supabase.co`. Supabase's fix is a paid custom domain. This one is free: Google returns to the app, the app trades the code for Google's ID token, and hands that to Supabase with `signInWithIdToken`. Supabase never talks to Google.

Existing users are unaffected: both flows key the Supabase identity on Google's `sub`, which is one per Google account whichever OAuth client asked.

1. **Routes.**

   ```ts
   // app/auth/google/route.ts
   import { createGoogleStart } from "@aimhuge/auth/server";
   export const GET = createGoogleStart({ defaultNext: "/app" });

   // app/auth/google/callback/route.ts
   import { createGoogleCallback } from "@aimhuge/auth/server";
   export const GET = createGoogleCallback({ defaultNext: "/app", onSignedIn });
   ```

   Keep `/auth/callback`: magic links still land there, and so does the hosted flow when it runs (below).

2. **The button.** Pass `googleSignInPath: "/auth/google"` to `LoginForm` / `useLoginFlow` and to `useAuth`. Web only: in a desktop shell, and when `linkAnonymous` upgrades a guest, the hosted flow still runs, so an app using either keeps `supabase.co` registered.

3. **Env.** `GOOGLE_SIGNIN_CLIENT_ID` and `GOOGLE_SIGNIN_CLIENT_SECRET`, server-only. Until both are set, `/auth/google` runs the hosted flow instead, so step 2 can ship before step 4.

4. **Google Cloud.** Use the OAuth client Supabase's Google provider already has (its client ID is already the one Supabase accepts tokens for); add a client secret for the app if you can't read the existing one. Add `https://<app>/auth/google/callback` and `http://localhost:<port>/auth/google/callback` to its redirect URIs. A different client works too, as long as its client ID is listed under Supabase → Authentication → Providers → Google, or Supabase refuses the token (`reason=session`, "Unacceptable audience").

5. **Once sign-in works through it**, remove the `supabase.co` redirect URI from the client and `supabase.co` from the project's authorized domains.

The flow: `state` (CSRF) and a PKCE verifier ride an httpOnly cookie scoped to `/auth/google`; Google sees only `state` and the verifier's hash. Failures go to `/login?error=link&reason=…`: `provider`, `state` (no cookie, or a different one: another browser, or over ten minutes), `nocode`, `config`, `exchange` (Google refused the code), `session` (Supabase refused the token). A cancel on Google's screen goes back to the form with no error.

## Gotchas

- **Redirect URLs.** `/auth/callback?next=…` has to match an allowed Redirect URL in Supabase, or the project needs a wildcard (`https://app.example/**`, `http://localhost:4001/**`). Without it, OAuth fails with a redirect mismatch.
- **PKCE across origins.** The code verifier cookie is per-host. If the flow starts on `www.` and comes back to the apex, the exchange fails with `reason=exchange`. Redirect `www` to the apex.
- **`/auth/confirm` is opt-in.** It only receives traffic once the Supabase email templates link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…`. It is the variant that survives a link opened on another device, or pre-opened by a mail scanner.
- **`next` is attacker-controlled.** Everything goes through `safeNextPath`, which resolves the value the way a browser would. A prefix check misses `/\evil.com`.
- **Tests in an app** that render these components should inline the package (`test.server.deps.inline: [/@aimhuge\/auth/]`). Then vitest runs it through its own transform, and `vi.mock("next/navigation")` and friends apply to it.

## Developing

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build     # writes dist/, which IS committed — apps install from a git tag
```
