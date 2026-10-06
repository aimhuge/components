/**
 * Slack's text format, mrkdwn, is not Markdown: `*bold*` not `**bold**`,
 * `<url|label>` not `[label](url)`, no headings. Everything BlastCP writes
 * into Slack goes through here — a post's body, the admin feed, the client's
 * answers — so the three can't disagree about escaping.
 */
/**
 * Slack requires exactly these three characters be entity-escaped in mrkdwn;
 * everything else is safe as typed. For text a person or a platform wrote —
 * never for markup we are building, which would escape our own `<url|…>`.
 */
export declare function escSlack(s: string): string;
/** A link. The label is escaped; `|` would end the label early, so it can't appear. */
export declare function slackLink(url: string, label: string): string;
/**
 * Markdown (what a post's body and a model's answer are written in) to
 * mrkdwn. Deliberately small: the constructs people actually type.
 *
 * - `[label](url)` → `<url|label>`; bare URLs are left for Slack to link.
 * - `**bold**` / `__bold__` → `*bold*`; `~~strike~~` → `~strike~`.
 * - `# Heading` lines → a bold line (Slack has no headings).
 * - `- item` / `* item` → `• item`.
 * - Code spans and fences pass through unchanged — mrkdwn shares them.
 *
 * Links are lifted out first and restored last, so their URLs are never
 * escaped or bolded, and the text around them is escaped exactly once.
 */
export declare function markdownToMrkdwn(md: string): string;
/** Cut to `max` characters on a word boundary where one is near, with an ellipsis. */
export declare function clip(s: string, max: number): string;
