# @aimhuge/neon

A Supabase-shaped service client over **Neon Postgres**, so the `@aimhuge`
packages written against a service-role `SupabaseClient` (billing first) run
on an app whose database is Neon.

It is the query-builder subset those packages actually call, compiled to
parameterised SQL. It is **not** PostgREST: no embedded resources, no RLS (it
runs as the connection's role), no JSON-path columns. Anything off the list
throws by name rather than guessing.

## Install

```bash
pnpm add "@aimhuge/neon@github:aimhuge/components#v0.10.0&path:/packages/neon" @neondatabase/serverless
```

## Use

```ts
import { neon } from "@neondatabase/serverless";
import { neonService, asSupabase } from "@aimhuge/neon";
import type { SupabaseClient } from "@supabase/supabase-js";

const service = asSupabase<SupabaseClient>(neonService(neon(process.env.DATABASE_URL!)));
await billing.subscription(service, orgId);   // @aimhuge/billing, unchanged
```

`neonService` takes anything with `query(text, params)`: `neon(url)` or a `pg` Pool.

### What it covers

| Call | Notes |
|---|---|
| `from(t).select(cols?, { count, head })` | plain column lists; `head: true` runs a `count(*)` |
| `.insert(row \| rows)` | multi-row; missing keys become `default`; returns the rows |
| `.upsert(rows, { onConflict, ignoreDuplicates })` | `on conflict (…) do update set` every non-key column |
| `.update(patch)`, `.delete()` | return the rows they touched |
| `eq neq gt gte lt lte like ilike is in` | every value is a bound parameter |
| `.not(col, "in" \| "is" \| op, value)` | `"(a,b)"` lists as PostgREST writes them |
| `.or("a.is.null,a.gt.x")` | `col.[not.]op.value` terms, `in.(…)` lists |
| `.order(col, { ascending, nullsFirst })`, `.limit(n)` | |
| `.single()`, `.maybeSingle()`, `await builder` | `{ data, error, count }`; `PGRST116` for none/many |
| `rpc(fn, namedArgs)` | `select * from fn(a => $1, …)`; a scalar result is `data` itself |

Errors keep Postgres' `code`, so `23505` duplicate checks (billing's webhook
idempotency) still work.

## SQL on Neon

`sql/0001_orgs.sql` is `orgs` + `org_memberships` with `@aimhuge/teams`' table
and column names, minus `auth.users`: `user_id` is the app's auth id as text
(Neon Auth / Better Auth ids aren't uuids). Run it before billing's SQL.

Supabase-targeted migrations need two things removed on Neon: foreign keys into
`auth.users` and grants to `service_role`. `supabaseSqlForNeon(sql)` does that,
and `splitSql(sql)` splits a file into statements (keeping `$$` bodies whole)
for neon's one-statement-per-query HTTP driver:

```ts
import { readFileSync } from "node:fs";
import { splitSql, supabaseSqlForNeon } from "@aimhuge/neon";

for (const f of ["0001_billing.sql", "0002_usage_ledger.sql"]) {
  const text = readFileSync(require.resolve(`@aimhuge/billing/sql/${f}`), "utf8");
  for (const stmt of splitSql(supabaseSqlForNeon(text))) await sql.query(stmt);
}
```

## What the app keeps

The connection string, the gate before any query (this client has no RLS, so
never hand it to the browser), and its own users table or auth provider.
