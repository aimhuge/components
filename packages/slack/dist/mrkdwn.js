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
export function escSlack(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/** A link. The label is escaped; `|` would end the label early, so it can't appear. */
export function slackLink(url, label) {
    return `<${url}|${escSlack(label).replace(/\|/g, "¦")}>`;
}
const MD_LINK = /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g;
const PLACEHOLDER = (i) => `\u0000${i}\u0000`;
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
export function markdownToMrkdwn(md) {
    const links = [];
    let text = md.replace(MD_LINK, (_m, label, url) => {
        links.push(slackLink(url, label));
        return PLACEHOLDER(links.length - 1);
    });
    // Fenced code is copied through verbatim (escaped, never re-styled).
    const parts = text.split(/(```[\s\S]*?```)/g);
    text = parts
        .map((part, i) => (i % 2 === 1 ? escSlack(part) : styleProse(escSlack(part))))
        .join("");
    return text.replace(/\u0000(\d+)\u0000/g, (_m, i) => links[Number(i)] ?? "");
}
function styleProse(s) {
    return s
        .split("\n")
        .map((line) => {
        const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
        if (heading?.[1])
            return `*${heading[1].replace(/\*\*/g, "")}*`;
        return line.replace(/^(\s*)[-*]\s+/, "$1• ");
    })
        .join("\n")
        .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
        .replace(/__([^_\n]+)__/g, "*$1*")
        .replace(/~~([^~\n]+)~~/g, "~$1~");
}
/** Cut to `max` characters on a word boundary where one is near, with an ellipsis. */
export function clip(s, max) {
    if (s.length <= max)
        return s;
    const cut = s.slice(0, max - 1);
    const space = cut.lastIndexOf(" ");
    return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
}
