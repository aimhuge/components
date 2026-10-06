# @aimhuge/slack

The Slack plumbing the AimHuge apps share: the Web API client, request
verification, the Add-to-Slack install, signed account links, sending to a
person or a channel, the Events API and button plumbing, incoming webhooks,
per-event toggles, and a model-agnostic agent loop. Extracted from BlastCP's
Slack app (the admin feed, Slack as a publishing channel, Slack as a client)
and DeckCP's (customer notifications, the commits/deploys feed), which had
each grown the same OAuth, client and verification code.

## What the package owns, and what the app keeps

| The package | The app |
|---|---|
| `callSlack`: one fetch, Slack's error shape, timeouts, `Retry-After` | What a refusal means for its feature (BlastCP's publish rule 3) |
| Messages: post, update, ephemeral, permalink, DM, join, find by metadata | What it posts, and when |
| `verifySlackRequest` (v0 HMAC, 5-minute replay window) | The route that reads the raw body and calls it |
| Add to Slack: state + nonce, install URL, code exchange, `parseSlackInstall` | Its scopes, its cookie name and path, its redirect route, what an install attaches to |
| `slack_installations`: save, get, revoke | Anything copied from it (BlastCP's `channels` rows) |
| Signed account links and `slack_user_links` | The page that confirms a link, behind its own sign-in |
| `sendToUser` / `sendToChannel` | Which person or channel, and the message |
| Events: `readSlackRequest`, dedupe receipts, "is this a person talking to the bot" | What a message does, and Next's `after()` |
| Buttons: parse, `respondTo`, `whisper`, `replaceMessage`, `inputValue` | What a button does |
| Incoming webhooks: `postWebhook`, `fireWebhook`, `liveWebhookUrl`, masking | The events and their wording |
| Toggles: defaults + stored deviations | The event list and its labels |
| The agent loop and its conversation memory | The model adapter, the tools, the instructions |
| The SQL (`sql/0001_slack.sql`) | Copying it into its own migrations |

## Install

```bash
pnpm add "@aimhuge/slack@github:aimhuge/components#vX.Y.Z&path:/packages/slack"
```

The repo is public: nothing account-specific lives here. Client ids, secrets,
signing secrets, webhook URLs and bot tokens stay in each app's environment
and database. Two entry points:

- `@aimhuge/slack`: pure and client-safe. mrkdwn (`escSlack`, `slackLink`,
  `markdownToMrkdwn`, `clip`), webhook-URL checks and masking, toggles.
- `@aimhuge/slack/server`: everything that calls Slack or Supabase. Opens with
  `import "server-only"`.

**Vitest in the app** must inline the package so the app's `server-only` stub
applies to it too:

```ts
test: { server: { deps: { inline: [/@aimhuge\//] } } }
```

## Setup

**1. Schema.** Copy `sql/0001_slack.sql` into `supabase/migrations/` under a
new timestamp and apply it: `slack_installations` (one row per Slack
workspace, its bot token), `slack_user_links` (a Slack person → an auth user),
`slack_conversations` (an agent's memory per thread) and
`slack_event_receipts` (Events API dedupe). All RLS-on with no policies: the
service role only, because they hold tokens or people's writing.

**2. Env.** `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`,
read by `slackAppConfig()`, which returns null until all three are set. A
webhook feed reads its URL through `liveWebhookUrl({ name, devFlag })`, which
answers only on the production deployment (or with the dev flag set), because
previews are production builds too and a URL is not a guard.

**3. Routes.** The app owns them. Each one is a few lines over the package:

```ts
// app/api/slack/events/route.ts
const read = readSlackRequest({ rawBody: await req.text(), timestamp, signature, signingSecret });
if (read.kind === "unverified") return new Response(null, { status: 401 });
if (read.kind === "challenge") return Response.json({ challenge: read.challenge });
if (read.kind === "event") after(() => myHandler(service, read.envelope)); // dedupe with firstDelivery
return new Response(null, { status: 200 });
```

Slack retries an event it doesn't see acknowledged within 3 seconds, so answer
first and work in `after()`. Slack also appends `--source=…` to every Slack CLI
hook, so a manifest hook that cats a file needs a shell wrapper:
`"get-manifest": "sh -c 'cat manifest.json' get-manifest"`.

## The rules it encodes

- **A thrown or timed-out write may have landed.** `callSlack` reports
  `unreached` with `timedOut`; whether to retry is the caller's call, and for
  anything a person would see twice, the answer is no.
- **Link by proof, never by email.** A Slack admin can set anyone's display
  email. `signLinkToken` goes only to that Slack person; the app's link page
  needs its own signed-in user.
- **Webhook URLs are bearer secrets.** Never logged (`postWebhook` logs the
  status, not the URL); `maskWebhookUrl` is what a settings page shows.
- **The agent loop never throws.** Tool errors go back to the model as
  `is_error` results, output is capped, and turns and wall time are bounded.
  The instructions are handed to the model adapter separately: an
  Anthropic-style API takes `system`; a gateway that drops it (Puku) uses
  `fenceInstructions`.
