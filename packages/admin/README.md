# @aimhuge/admin

The shape of a super-admin page: search, sort, paginated table, the
acting-as banner, and the page guard. Apps bring the column defs and the
data fetching.

This package is the chrome — `<AdminTablePage>`, `<SuperAdminBanner>`,
`<SearchControls>`, the `idTailColumn` / `timestampColumn` / sortable
header helpers, and `requireSuperAdmin`. The page's *content* is the
app's job: which columns to show, where the rows come from (trpc,
Prisma, Supabase, anything).

The super-admin concept itself lives in `@aimhuge/teams`
(`isSuperAdmin`, `SUPER_ADMIN_EMAILS`). `@aimhuge/admin` re-uses that
helper rather than re-implementing it, so a single env var governs admin
access across every app that installs both packages.

## What the package owns, and what the app keeps

| Package | App |
|---|---|
| `requireSuperAdmin`, `isAdminCaller` | Where the session email is read from (NextAuth, Supabase, custom JWT) |
| `isSuperAdmin` (re-exported from `@aimhuge/teams`) | The `SUPER_ADMIN_EMAILS` env var name is owned by `@aimhuge/teams` |
| `<AdminTablePage>`, `<SearchControls>`, `<SuperAdminBanner>`, `useDebouncedSearch` | The page's title, resource name, the itemsPerPage, the initial sort |
| `idTailColumn`, `timestampColumn`, `<SortableTableHeaderItem>`, `parseSort`, `nextSort` | The columns themselves — what fields, what cell renderers, what business actions live in the rows |
| The "X of Y" / pagination chrome | The route the page mounts at, the parent layout, the `not-found.tsx` |
| No CSS of its own — Tailwind class tokens like `text-admin-text`, `bg-admin-surface` | The app defines those tokens (one block of CSS, copy-paste-able) |

## Wiring an app

1. **Install.** From a git tag, with a path into the workspace:
   ```bash
   pnpm add "@aimhuge/admin@github:aimhuge/components#v0.1.0&path:/packages/admin"
   ```

2. **Set `SUPER_ADMIN_EMAILS`.** Comma-separated, normalized by
   `@aimhuge/teams`. The same var gates this package's `requireSuperAdmin`
   guard and the `isSuperAdmin` check in your nav.

3. **Add the design tokens.** The components emit a small set of Tailwind
   class tokens. Define them once in your global CSS so the package can
   sit in any design system:
   ```css
   :root {
     --admin-bg: #0b0b0c;
     --admin-surface: #15151a;
     --admin-border: #2a2a32;
     --admin-text: #f3f3f5;
     --admin-muted: #9a9aa6;
     --admin-accent: #7dd3fc;
     --admin-error: #fca5a5;
   }
   .text-admin-text    { color: var(--admin-text); }
   .text-admin-muted   { color: var(--admin-muted); }
   .text-admin-accent  { color: var(--admin-accent); }
   .text-admin-error   { color: var(--admin-error); }
   .bg-admin-bg        { background: var(--admin-bg); }
   .bg-admin-surface   { background: var(--admin-surface); }
   .border-admin-border{ border-color: var(--admin-border); }
   ```

4. **Write the page.** Drop one of these in `app/(admin)/users/page.tsx`:
   ```tsx
   import { AdminTablePage, requireSuperAdmin, idTailColumn, timestampColumn } from "@aimhuge/admin";
   import { type ColumnDef } from "@tanstack/react-table";
   import { trpc } from "~/lib/trpc";

   interface UserRow {
     id: string;
     email: string;
     createdAt: Date;
   }

   export default async function UsersAdmin() {
     const session = await getSession();
     requireSuperAdmin({ email: session?.user?.email });

     const useQuery = (args: { skip: number; take: number; searchTerm: string; sort: string }) => {
       const q = trpc.user.getUserList.useQuery(args);
       return {
         rows: q.data?.users ?? [],
         total: q.data?.totalUsersCount ?? 0,
         isLoading: q.isLoading,
         error: q.error,
       };
     };

     const columns: ColumnDef<UserRow>[] = [
       idTailColumn<UserRow>(),
       { id: "email", accessorKey: "email", header: "Email",
         cell: ({ row }) => <span>{row.original.email}</span> },
       timestampColumn<UserRow>({ field: "createdAt", label: "Created" }),
     ];

     return (
       <AdminTablePage<UserRow>
         title="Users Admin"
         resource="users"
         session={session?.user}
         columns={columns}
         useResourceQuery={useQuery}
       />
     );
   }
   ```

5. **Add a `not-found.tsx`** so an unauthorized visitor sees a 404, not
   a 403 (a 403 leaks the route).

## What this package is NOT

- Not a data layer. It does not import trpc, Prisma, or Supabase. Apps
  pass a `useResourceQuery` hook that already has its own client.
- Not a CSS library. It uses Tailwind class tokens; the app defines them.
- Not a replacement for `@aimhuge/teams`. The super-admin concept lives
  there. This package is the UI that consumes it.
- Not the column definitions for a specific app. fastmonitor's
  `userTableColDefs` is full of `lastLighthousePerformanceScore`,
  `assignAllUrlNotificationsForTeamToUser`, etc. — those stay in
  fastmonitor. The package's column helpers are generic.

## Test plan

```bash
pnpm --filter @aimhuge/admin test         # vitest
pnpm --filter @aimhuge/admin typecheck    # tsc --noEmit
pnpm --filter @aimhuge/admin build        # tsc -p tsconfig.build.json
```

Component tests live in `src/__tests__/*.test.tsx` and run under jsdom;
pure logic tests are `*.test.ts` and run under node.
