-- The BlastCP Slack app: one app, three jobs (docs/architecture/slack.md).
-- The admin feed needs no table (an incoming webhook in env). The channel and
-- the client need these four. All are service-role only — RLS on, no policies
-- — because they hold bot tokens or people's writing, exactly like `channels`.

-- One row per Slack workspace (team) the app is installed in. The bot token
-- belongs to the WORKSPACE, not to a BlastCP channel: every `slack` channel
-- row of the team carries a copy in `channels.access_token` (what the
-- publisher hands an adapter), rewritten on reinstall.
create table if not exists public.slack_installations (
  team_id          text primary key,
  team_name        text,
  enterprise_id    text,
  bot_user_id      text not null,
  bot_token        text not null,
  scopes           text not null default '',
  installed_by     uuid references auth.users (id) on delete set null,
  status           text not null default 'active' check (status in ('active', 'revoked')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.slack_installations enable row level security;

-- A Slack person → the BlastCP user they act as. Made only by the link page,
-- which needs both the signed link sent to that Slack person AND a signed-in
-- BlastCP session — never by matching emails.
create table if not exists public.slack_user_links (
  team_id          text not null,
  slack_user_id    text not null,
  user_id          uuid not null references auth.users (id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (team_id, slack_user_id)
);
alter table public.slack_user_links enable row level security;
create index if not exists slack_user_links_user_idx on public.slack_user_links (user_id);

-- The client's memory: the plain text of each turn in one conversation (a
-- channel thread, or a DM's rolling conversation), last 20 messages. Never
-- the tool calls. Erased with the user.
create table if not exists public.slack_conversations (
  team_id          text not null,
  channel_id       text not null,
  thread_key       text not null,
  user_id          uuid references auth.users (id) on delete cascade,
  messages         jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  updated_at       timestamptz not null default now(),
  primary key (team_id, channel_id, thread_key)
);
alter table public.slack_conversations enable row level security;

-- Slack retries an event it didn't see acknowledged in 3 seconds. The first
-- delivery inserts its event_id here before any work; a retry hits the
-- primary key and stops. Safe to prune after a day.
create table if not exists public.slack_event_receipts (
  event_id         text primary key,
  received_at      timestamptz not null default now()
);
alter table public.slack_event_receipts enable row level security;
