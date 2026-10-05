-- @aimhuge/billing 0002 — the metered-usage ledger.
--
-- Metered charges against a plan's per-period allowance (BlastCP's image
-- credit; any app's next meter). A meter is just a name; the plan catalog in
-- TypeScript says how much of it each plan grants and whether that resets.
--
-- MONEY IS INTEGER MICRO-DOLLARS (1e-6 USD) on a money meter. A cheap
-- generated image retails at $0.00317; rounded to cents, three of BlastCP's
-- four image models would be free. A count meter (tokens, renders) stores the
-- count in the same `amount` column — the unit belongs to the meter.
--
-- THE BALANCE IS DERIVED, NOT COUNTED: allowance + unexpired grants − usage
-- in the window, read on every check. A counter drifts from the rows that
-- justify it. The sum runs here, in org_usage_total, because a client-side sum
-- would stop at PostgREST's row cap and undercount a busy org.

-- ── Charges ─────────────────────────────────────────────────────────────────
create table if not exists public.org_usage_charges (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  meter        text not null check (meter ~ '^[a-z][a-z0-9_]{0,40}$'),
  -- What the ORG was charged, in the meter's unit.
  amount       bigint not null check (amount >= 0),
  -- What it cost US, when known. Stored beside the price so the margin is on
  -- every row and a later markup change can't rewrite past charges.
  cost_micros  bigint check (cost_micros >= 0),
  -- What the charge was for, e.g. ('media', <uuid>). Deliberately NOT a
  -- foreign key: deleting the thing must not erase the fact it was paid for,
  -- or a balance could be refilled by deleting history.
  ref_type     text,
  ref_id       text,
  metadata     jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users(id) on delete set null,
  created_via  text not null default 'app' check (created_via in ('app', 'mcp', 'system')),
  created_at   timestamptz not null default now()
);

comment on table public.org_usage_charges is
  'Metered usage ledger. One row per charge, amount in the meter''s unit (micros for money meters). The balance is derived from these rows, never stored.';

-- The balance query: one org, one meter, since the window start.
create index if not exists org_usage_charges_org_meter_time_idx
  on public.org_usage_charges (org_id, meter, created_at desc);

alter table public.org_usage_charges enable row level security;

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Credit ADDED on top of the plan's allowance: a trial extension, an apology,
-- a bought bundle. Not a replacement for the allowance — that comes from the
-- catalog, so changing a plan's allowance changes it for every subscriber at
-- once. A grant counts while unexpired; a one-off top-up for this period is a
-- grant that expires at the period end.
create table if not exists public.org_credit_grants (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  meter             text not null check (meter ~ '^[a-z][a-z0-9_]{0,40}$'),
  amount            bigint not null check (amount > 0),
  reason            text,
  granted_by_email  text,
  expires_at        timestamptz,
  created_at        timestamptz not null default now()
);

comment on table public.org_credit_grants is
  'Credit added on top of a plan''s metered allowance. Counts while expires_at is null or in the future.';

create index if not exists org_credit_grants_org_meter_idx
  on public.org_credit_grants (org_id, meter);

alter table public.org_credit_grants enable row level security;

-- ── The sum ─────────────────────────────────────────────────────────────────
-- Usage on one meter since `p_since` (null = all time, for allowances that
-- never reset). bigint in, bigint out — no float anywhere near money.
create or replace function public.org_usage_total(p_org_id uuid, p_meter text, p_since timestamptz)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(amount), 0)::bigint
    from public.org_usage_charges
   where org_id = p_org_id
     and meter = p_meter
     and (p_since is null or created_at >= p_since);
$$;

-- Service role only, like the tables it reads. A balance an authenticated
-- client could read directly is one it could try to probe across orgs.
revoke all on function public.org_usage_total(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.org_usage_total(uuid, text, timestamptz) to service_role;
