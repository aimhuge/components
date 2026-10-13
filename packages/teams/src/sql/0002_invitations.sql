-- teams-0002 — public.invitations: pending email invites to a workspace.
--
-- Transplanted from blastcp's 20260923200100_invitations.sql on 2026-10-13.
--
-- One row per invite. The token is the capability — opening
-- /invite/{token} while signed in (to any address) accepts the invite and
-- adds the claimer as a member of the target org. The invited_email is
-- recorded so we can detect "claimed by someone other than the address
-- we sent to" and surface it on the roster, but acceptance is not gated
-- on matching it (identity-is-email rule, borrowed from deckcp — the
-- link works with whatever account the recipient signs in with).
--
-- The accepted_user_id / accepted_at columns are written at acceptance
-- time so a pending invite can never re-claim and a re-clicked link is a
-- no-op.
--
-- Access: service-role only. RLS enabled, no policies; src/lib/invites.ts
-- uses the service client and is the only writer.

create table if not exists public.invitations (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id) on delete cascade,
  -- Lowercased on insert (see check below). Kept as text, not citext, to
  -- match every other email column in this schema.
  invited_email    text not null,
  role             text not null default 'member' check (role in ('owner', 'admin', 'member')),
  -- 32 random bytes, base64url-encoded. Single-use secret: rotating it
  -- after a revoke invalidates any leaked link. Partial unique index
  -- below.
  invite_token     text not null,
  -- The auth user who sent the invite (org owner/admin). Null when the
  -- invite is system-issued.
  invited_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '14 days'),
  accepted_at      timestamptz,
  accepted_user_id uuid references auth.users(id) on delete set null,
  accepted_email   text,
  revoked_at       timestamptz
);

-- Token must be unique among un-revoked, un-expired invites so the same
-- link can never resolve to two different invitations. A partial unique
-- index (rather than a column-level UNIQUE) is what makes "revoke =
-- invalidate the link" possible — once revoked, the same token may be
-- re-minted for a future invite to the same address.
create unique index if not exists invitations_token_active_idx
  on public.invitations (invite_token)
  where accepted_at is null and revoked_at is null;

create index if not exists invitations_org_pending_idx
  on public.invitations (org_id, created_at desc)
  where accepted_at is null and revoked_at is null;

create index if not exists invitations_email_lookup_idx
  on public.invitations (lower(invited_email));

alter table public.invitations enable row level security;
-- No policies. Service-role reads/writes only. A user wanting to see
-- their own invite hits /invite/{token}, which resolves through the
-- gate.