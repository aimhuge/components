# @aimhuge/teams

Workspace teams for the AimHuge Next.js apps: the org gate, org members
and roles, the email-invite flow, the Team page UI, and the SQL schema
behind all of it. One copy of the workspace-membership domain instead of
a fork per app.

## What the package owns, and what the app keeps

| Package | App |
|---|---|
| `requireOrg` / `sessionClaims`: the per-route gate, browser-cached verdict, super-admin god view | The Proxy that refreshes the session on every request |
| `Org`, `OrgRole`, `listUserOrgs`, `listOrgMembers`, `setCurrentOrg`, `createOrg`, `reserveOrgSlug`, `currentOrgForUser`, `ensureCurrentOrgSlug` | Where the active-workspace pointer is read or written (`profiles.current_org_id`) |
| `roleCan`, `roleAtLeast`, `assignableRoles`, `roleLabel`, `roleDescription`, `effectivePermissions` | App-specific permission enums (posts.publish, channels.manage, etc. — these ARE in the package, but apps can add more) |
| `createInvite`, `revokeInvite`, `lookupInviteByToken`, `acceptInvite`, `listPendingInvites`, `mintInviteToken`, `inviteClaimUrl`, `inviteEmailBody` | The `/invite/[token]` page itself (apps control copy + chrome) |
| `AddMemberForm`, `TeamRoster`, `PendingInviteList`, `OrgProvider`, `useOrg` | The `/[orgSlug]/team` page chrome (header, layout) and any app-specific rosters (decks owned, last login, status pill) |
| `normalizeEmail`, `isPlausibleEmail`, `escapeLikeWildcards` | The app's other email code may share these — no harm in importing |
| `isReservedSlug`, `slugify`, `RESERVED_SLUGS`, `isSafeOrgSlug`, `ORG_SLUG_PATTERN` | App-specific reserved slugs (the package ships a sensible default; apps extend) |
| `isSuperAdmin`, `SUPER_ADMIN_EMAILS` | The `SUPER_ADMIN_EMAILS` env var name is fixed by the package |
| `siteOrigin` | App brand name in the email body (`appName` to `createInvite`) |
| `configureTeamActions` + the `addMember`/`changeRole`/`removeMember`/`revokePendingInvite` server actions | App-specific hooks (`onMembershipChanged` for slack reports, ledger rows, analytics) |
| The SQL: `orgs`, `org_memberships`, `profiles`, `invitations` | App-specific tables (decks, posts, channels, …) — they all link to `orgs.id` |

## Wiring an app

1. **Install.** From a git tag, with a path into the workspace:
   ```bash
   pnpm add "@aimhuge/teams@github:aimhuge/components#v0.5.0&path:/packages/teams"
   ```

2. **Build a service-role Supabase client** (one helper, used everywhere):
   ```ts
   // lib/supabase.ts
   import { createServiceClient } from "@aimhuge/teams";
   export const service = createServiceClient({
     url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
     serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
   });
   ```
   And a cookie-bound SSR client for the gate (it reads JWT claims):
   ```ts
   import { createServerClient } from "@supabase/ssr";
   import { cookies } from "next/headers";
   export const ssr = () => createServerClient(/* …your wiring… */);
   ```
   Apps pass both into the gate via `TeamClients`.

3. **Apply the SQL.** Run the two files in `src/sql/` against your
   Supabase project. Both are idempotent and split out so you can run
   them in the right order (`0001_orgs_and_memberships.sql` first).

4. **Register an email transport.** The package's `createInvite` takes
   an `InviteEmailTransport` — apps pass their existing `sendEmail`
   helper. The package never sends mail itself.
   ```ts
   import type { InviteEmailTransport } from "@aimhuge/teams";
   const email: InviteEmailTransport = {
     async send({ to, subject, text }) {
       await sendEmail({ to, subject, text });
     },
   };
   ```

5. **Configure the team actions once** (so client components can call
   them without prop-drilling config):
   ```ts
   // instrumentation.ts (or any module that loads at startup)
   import { configureTeamActions } from "@aimhuge/teams";
   configureTeamActions({
     clients: { service, ssr: ssr() },
     email,
     appName: "BlastCP",
     assertSeatRoom: assertSeatRoom,   // your billing helper, optional
     onMembershipChanged: async (e) => {
       // fire analytics, slack reports, invite-ledger rows
     },
   });
   ```

6. **The page.** Server Component, calls the gate:
   ```tsx
   // app/[orgSlug]/team/page.tsx
   import { requireOrg, listOrgMembers, listPendingInvites, roleCan } from "@aimhuge/teams";
   import { TeamRoster, AddMemberForm, PendingInviteList, OrgProvider } from "@aimhuge/teams";

   export default async function TeamPage({ params }) {
     const { orgSlug } = await params;
     const ctx = await requireOrg({ service, ssr: ssr() }, orgSlug);
     const [members, pending] = await Promise.all([
       listOrgMembers(ctx.service, ctx.org.id),
       listPendingInvites(ctx.service, ctx.org.id),
     ]);
     const canManage = roleCan(ctx.role, "members.manage") || ctx.isSuperAdmin;
     return (
       <OrgProvider value={{ org: ctx.org, role: ctx.role, orgs: ctx.orgs, isSuperAdmin: ctx.isSuperAdmin }}>
         <TeamRoster orgSlug={orgSlug} currentUserId={ctx.userId} members={members} actorRole={ctx.role} canManage={canManage} />
         {canManage && <AddMemberForm orgSlug={orgSlug} actorRole={ctx.role} isSuperAdmin={ctx.isSuperAdmin} />}
         {pending.length > 0 && <PendingInviteList orgSlug={orgSlug} invites={pending} canManage={canManage} />}
       </OrgProvider>
     );
   }
   ```

7. **The claim route.** Apps write their own page (they own the copy and
   the brand chrome). The package gives you the two functions you need:
   ```tsx
   // app/invite/[token]/page.tsx
   import { lookupInviteByToken, acceptInvite, sessionClaims } from "@aimhuge/teams";

   async function Page({ params }) {
     const { token } = await params;
     const session = await sessionClaims({ service, ssr: ssr() });
     if (!session) return <SignedOutView token={token} />;
     const lookup = await lookupInviteByToken(service, token);
     if (!lookup) return <BadInvite />;
     const result = await acceptInvite(service, lookup, session.sub, session.email!);
     redirect(`/${result!.orgSlug}?invite_accepted=1`);
   }
   ```

## Schema

```
public.orgs (
  id uuid PK, slug text UNIQUE, name text,
  require_post_approval bool, created_at, updated_at
)
public.org_memberships (
  org_id FK→orgs, user_id FK→auth.users,
  role IN ('owner','admin','member'),
  created_at, PK(org_id, user_id)
)
public.profiles (
  id PK FK→auth.users, email, login_count,
  current_org_id FK→orgs NULL, created_at, …
)
public.invitations (
  id PK, org_id FK→orgs, invited_email, role, invite_token,
  invited_by FK→auth.users NULL, created_at, expires_at default now()+14d,
  accepted_at, accepted_user_id FK→auth.users NULL, accepted_email, revoked_at
)
UNIQUE INDEX (invite_token) WHERE accepted_at IS NULL AND revoked_at IS NULL
```

The org tables have RLS enabled with no policies. Access is enforced
in app code: the gate (`requireOrg`) runs before any query, and every
read filters by `org_id` through the service client.

## Gotchas

- **Reserved slugs.** A workspace at the URL root (`/acme/...`) shares
  the namespace with real root routes. The package ships a default
  `RESERVED_SLUGS` set; apps extend it at startup if they have root
  routes the package doesn't know about.
- **Identity-is-email rule.** A recipient can sign in with a different
  address than the one the invite was sent to, and the invite still
  works. The `accepted_email` is recorded so the roster can surface
  "this person accepted with a different email". Reject the link in your
  UI copy and your tests will pass but your users will be confused.
- **Pending invite holds a seat.** Re-sending an existing pending invite
  (same address, same row) does not consume a second seat. The new
  `assertSeatRoom` hook (optional) only runs on the first insert.
- **Tests in an app** that render the client components should inline
  the package (`test.server.deps.inline: [/@aimhuge\/teams/]`). Then
  vitest runs it through its own transform, and `vi.mock("next/navigation")`
  and friends apply to it.
- **No MFA baked in.** The gate returns a slim `OrgContext` without
  `mfaLevel` or `nextLevel`. Apps that need MFA wrap the gate — see
  blastcp's `lib/org-gate.ts` for the multi-factor pattern.

## Developing

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build     # writes dist/, which IS committed — apps install from a git tag
```