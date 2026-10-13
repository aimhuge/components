import type { OrgRole } from "../server/members.js";
/** Form to invite a new member by email. UX: errors from the server come
 *  back via useActionState; the form is sticky on partial failure. The
 *  role select has a live description of what each role can do so the
 *  inviter doesn't have to guess.
 *
 *  Styled with neutral Tailwind classes; apps can wrap this in their own
 *  branded chrome or import it as-is. */
export declare function AddMemberForm({ orgSlug, actorRole, isSuperAdmin, }: {
    orgSlug: string;
    actorRole: OrgRole;
    isSuperAdmin: boolean;
}): import("react").JSX.Element;
