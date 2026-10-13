"use client";

import { useActionState, useState } from "react";
import { addMember, type ActionResult } from "../server/actions.js";
import { assignableRoles, roleDescription, roleLabel } from "../server/permissions.js";
import type { OrgRole } from "../server/members.js";

const initial: ActionResult = { ok: true };

/** Form to invite a new member by email. UX: errors from the server come
 *  back via useActionState; the form is sticky on partial failure. The
 *  role select has a live description of what each role can do so the
 *  inviter doesn't have to guess.
 *
 *  Styled with neutral Tailwind classes; apps can wrap this in their own
 *  branded chrome or import it as-is. */
export function AddMemberForm({
  orgSlug,
  actorRole,
  isSuperAdmin,
}: {
  orgSlug: string;
  actorRole: OrgRole;
  isSuperAdmin: boolean;
}) {
  // Super-admins get every role; everyone else is clipped by
  // assignableRoles.
  const options: OrgRole[] = isSuperAdmin
    ? ["admin", "member", "owner"]
    : assignableRoles(actorRole);

  // Always default to "member" — picking the last option in the array
  // would default to "owner" for super-admins, which is
  // privileged-by-default and a footgun. Make granting elevated roles an
  // explicit choice.
  const defaultRole: OrgRole = "member";
  const [picked, setPicked] = useState<OrgRole>(defaultRole);

  const bound = async (_prev: ActionResult, formData: FormData) => {
    return addMember(orgSlug, _prev, formData);
  };

  const [state, formAction, pending] = useActionState(bound, initial);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <input
            type="email"
            name="email"
            required
            placeholder="email@example.com"
            aria-label="Email address"
            className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm placeholder:text-muted"
          />
          {state.fieldErrors?.emailInput && (
            <p className="mt-1 text-xs text-red-400">{state.fieldErrors.emailInput}</p>
          )}
        </div>

        <select
          name="role"
          value={picked}
          onChange={(e) => setPicked(e.currentTarget.value as OrgRole)}
          className="rounded-lg border border-card-border bg-background px-3 py-2 text-sm"
          aria-label="Role"
        >
          {options.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send invite"}
        </button>
      </div>

      <p className="text-xs text-muted" aria-live="polite">
        <span className="font-medium text-foreground">{roleLabel(picked)}:</span>{" "}
        {roleDescription(picked)}
      </p>

      {state.message && !state.ok && !state.fieldErrors && (
        <p className="text-xs text-red-400">{state.message}</p>
      )}
      {state.message && state.ok && (
        <p className="text-xs text-emerald-400">{state.message}</p>
      )}
    </form>
  );
}