/**
 * `<SuperAdminBanner>` — the small "you are acting as super-admin, here's who
 * you are" strip that fastmonitor renders at the top of every admin page.
 *
 * The page passes in the session-shaped user object; we don't fetch it. The
 * app's data layer already has a query for "user by id" if the page wants the
 * canonical DB record next to the session — but for the banner the session is
 * enough and it avoids a round-trip on every admin page.
 *
 * All values are optional; missing ones render as `—`. The "copy on click"
 * behavior is a small affordance that doesn't need its own cell.
 */
import { useCallback, useState } from "react";

export interface SuperAdminSession {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  teamSlug?: string | null;
  teamId?: string | null;
  isSuperAdmin?: boolean;
}

interface CopyableProps {
  label: string;
  value: string | null | undefined;
  /** Truncate the visible label while keeping the full value copyable. */
  visibleChars?: number;
}

function Copyable({ label, value, visibleChars }: CopyableProps) {
  const [copied, setCopied] = useState(false);
  const handleClick = useCallback(() => {
    if (!value) return;
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  }, [value]);

  const display =
    value == null
      ? "—"
      : visibleChars != null && value.length > visibleChars
        ? value.slice(-visibleChars)
        : value;

  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <strong className="text-admin-muted">{label}:</strong>
      <button
        type="button"
        onClick={handleClick}
        disabled={!value}
        className="font-mono text-admin-text hover:text-admin-accent disabled:opacity-50"
        title={value ?? ""}
      >
        {display}
      </button>
      {copied ? <span className="text-admin-accent">copied</span> : null}
    </span>
  );
}

export function SuperAdminBanner({ session }: { session: SuperAdminSession | null | undefined }) {
  if (!session) {
    return (
      <p className="text-xs text-admin-muted">
        No session attached. The page guard should have already redirected.
      </p>
    );
  }
  return (
    <div
      role="status"
      className="flex flex-col gap-1 rounded-md border border-admin-border bg-admin-surface px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <strong className="text-admin-accent">SuperAdmin</strong>
        <Copyable label="Name" value={session.name} />
        <Copyable label="Email" value={session.email} />
        <Copyable label="UserId" value={session.id} visibleChars={5} />
        <Copyable label="TeamSlug" value={session.teamSlug} />
        <Copyable label="TeamId" value={session.teamId} visibleChars={5} />
      </div>
    </div>
  );
}
