-- teams-0001 — orgs, org_memberships, profiles.current_org_id, handle_new_user.
--
-- Transplanted from blastcp's 20260922200000_core.sql on 2026-10-13. Lives
-- here so the @aimhuge/teams package is self-contained: installing the
-- package is enough; no separate app-specific migration copy is required.
--
-- The table is still called `orgs` so existing code (the gate, the
-- membership reads) moves without edits. Apps say "workspace" in copy.
--
-- Access is enforced in app code: requireOrg gates every /[orgSlug]/…
-- route before any query, and every read filters by org_id through the
-- service client. RLS is ON with no policies on the org tables
-- (service-role only).

create or replace function public.set_updated_at_now() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── Profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  login_count integer not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;
do $$ begin
  create policy "Users can read own profile" on public.profiles
    for select using (auth.uid() = id);
exception when duplicate_object then null; end $$;

-- Null-safe on email: an anonymous sign-in has none, and a trigger that
-- compares NEW.email raises on null and aborts the sign-up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Workspaces ──────────────────────────────────────────────────────────────
create table if not exists public.orgs (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  -- Apps may add a `require_post_approval` flag for the agent-post flow.
  -- Kept optional so the schema doesn't presume a publishing module.
  require_post_approval boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.org_memberships (
  org_id     uuid not null references public.orgs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists org_memberships_user_idx on public.org_memberships (user_id);

alter table public.orgs            enable row level security;
alter table public.org_memberships enable row level security;

drop trigger if exists trg_orgs_updated_at on public.orgs;
create trigger trg_orgs_updated_at before update on public.orgs
  for each row execute function public.set_updated_at_now();

-- Active-workspace pointer. The app heals a stale pointer on read.
alter table public.profiles
  add column if not exists current_org_id uuid references public.orgs(id) on delete set null;