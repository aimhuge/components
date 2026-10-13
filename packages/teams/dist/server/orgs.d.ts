/**
 * Server-side org resolution for the `/[orgSlug]/…` route tree — the
 * workspace resolvers (slug reservation, creation, "which org am I in").
 *
 * - gate.ts    — `requireOrg`, the per-route gate (browser-cached verdict)
 * - members.ts — `Org`/`OrgRole`, `listUserOrgs`, `setCurrentOrg`
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Org } from "./members";
/**
 * First free, non-reserved org slug for `nameSeed`. Exported so a flow can
 * SHOW the URL an org is about to get (the admin hand-off preview) before
 * committing to it. Advisory, not a reservation: nothing holds the slug, so
 * `createOrg` re-runs it rather than trusting a value computed earlier.
 */
export declare function reserveOrgSlug(service: SupabaseClient, nameSeed: string): Promise<string>;
/** Create an org with a unique, non-reserved slug and seed the creator as
 *  owner.
 *
 *  `reserveOrgSlug` READS before we write, so two orgs created in the same
 *  instant can both be told the same slug is free. `orgs.slug` is UNIQUE,
 *  which turns that race into a 23505 rather than a duplicate — we
 *  recompute and retry, because the caller may already have created an
 *  account by this point and failing here would strand it. */
export declare function createOrg(service: SupabaseClient, ownerId: string, nameSeed: string): Promise<Org>;
/**
 * The user's active org, READ-ONLY: no workspace is created and no pointer
 * is written. For chrome that merely wants to POINT at the workspace — the
 * god-view sidebar showing the admin their own menu — where creating an org
 * as a side effect of rendering a nav would be wrong. Null when they have
 * none.
 */
export declare function currentOrgForUser(service: SupabaseClient, userId: string): Promise<Org | null>;
/**
 * Resolve the slug of the user's active org, creating a personal workspace
 * on first use. Used by the `/app` entry redirect and anywhere we need to
 * land a user in "their" org without a slug in hand.
 *
 * `onFirstWorkspace` is called exactly once, when we just created the
 * user's first workspace. Apps use it to fire analytics, slack reports,
 * invite-ledger rows, etc.
 */
export declare function ensureCurrentOrgSlug(service: SupabaseClient, userId: string, email: string | null, onFirstWorkspace?: (org: Org, userId: string, email: string | null) => Promise<void> | void): Promise<string>;
