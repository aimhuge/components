-- Orgs and memberships for an app on Neon, shaped like @aimhuge/teams'
-- (same table and column names, so @aimhuge/billing's `orgs` and
-- `org_memberships` reads work), minus Supabase's auth.users: user_id is the
-- app's auth user id as text (Neon Auth / Better Auth ids aren't uuids).
-- Idempotent.
create table if not exists public.orgs (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.org_memberships (
  org_id     uuid not null references public.orgs(id) on delete cascade,
  user_id    text not null,
  email      text,
  role       text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists org_memberships_user_idx on public.org_memberships (user_id);
