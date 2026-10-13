import { type ReactNode } from "react";
import type { Invitation } from "../server/invites.js";
type EmailRenderer = (props: {
    email: string;
    className?: string;
}) => ReactNode;
/** List of pending invitations with a Revoke action per row. The token
 *  itself never leaves this client island — a recipient's inbox is the
 *  only place the secret copy lives. */
export declare function PendingInviteList({ orgSlug, invites, canManage, renderEmail, formatExpiry, }: {
    orgSlug: string;
    invites: Invitation[];
    canManage: boolean;
    renderEmail?: EmailRenderer;
    /** Optional pretty-printer for the expiry date — apps typically have a
     *  shared `formatAbsoluteShort` in their format helpers. */
    formatExpiry?: (iso: string) => string;
}): import("react").JSX.Element;
export {};
