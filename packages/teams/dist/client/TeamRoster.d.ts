import { type OrgRole, type OrgMember } from "../server/members.js";
/** Display a member's email. Apps that already have an EmailLink component
 *  can pass it in via `renderEmail`; otherwise we render a bare text node,
 *  which a linkifier browser extension may wrap after hydration. */
type EmailRenderer = (props: {
    email: string;
    className?: string;
}) => React.ReactNode;
/** The members table: one row per member with role select + remove button.
 *
 *  Permission gating: `canManage` from the parent decides whether the
 *  controls render at all. The server action re-checks — that's the actual
 *  boundary — so a stale render with a stale permission can't do harm. */
export declare function TeamRoster({ orgSlug, currentUserId, members, actorRole, canManage, renderEmail, }: {
    orgSlug: string;
    currentUserId: string;
    members: OrgMember[];
    actorRole: OrgRole;
    canManage: boolean;
    renderEmail?: EmailRenderer;
}): import("react").JSX.Element;
export {};
