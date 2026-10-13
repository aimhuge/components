import type { SupabaseClient } from "@supabase/supabase-js";
import { type TeamClients } from "./gate";
import { type OrgRole } from "./members";
import { type InviteEmailTransport } from "./invites";
export interface ActionResult {
    ok: boolean;
    message?: string;
    /** Field name → reason, for the form to display inline. */
    fieldErrors?: Record<string, string>;
}
/** Options the app passes in once at startup. The actions read these on every
 *  call so the import is per-action, not per-render. */
export interface TeamActionsConfig {
    clients: TeamClients;
    email: InviteEmailTransport;
    appName?: string;
    assertSeatRoom?: (service: SupabaseClient, orgId: string) => Promise<void>;
    /**
     * Optional callback fired after a successful invite/membership write, for
     * app-specific side effects (analytics, slack reports, invite-ledger rows).
     * Best-effort: a throw is logged and the action still returns success.
     */
    onMembershipChanged?: (ctx: {
        kind: "added" | "removed" | "role_changed" | "invited" | "invite_revoked";
        orgId: string;
        orgSlug: string;
        userId: string | null;
        email: string | null;
        role: OrgRole;
    }) => Promise<void> | void;
}
/** Apps call this once at boot (e.g. in a module-init file or
 *  instrumentation hook) to register their config. After this, server
 *  actions can be called from any client component. */
export declare function configureTeamActions(config: TeamActionsConfig): void;
/** Invite a new member by email. If the address already has an account, we
 *  add them immediately and skip the email — without it the recipient
 *  would have to click a link to join a workspace they already had access
 *  to. */
export declare function addMember(orgSlug: string, _prev: ActionResult, formData: FormData): Promise<ActionResult>;
export declare function changeRole(orgSlug: string, formData: FormData): Promise<ActionResult>;
export declare function removeMember(orgSlug: string, formData: FormData): Promise<ActionResult>;
export declare function revokePendingInvite(orgSlug: string, formData: FormData): Promise<ActionResult>;
