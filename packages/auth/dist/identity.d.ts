import type { User } from "@supabase/supabase-js";
/** Who the "already signed in" banner says you are. */
export type SessionIdentity = {
    name: string | null;
    avatarUrl: string | null;
    email: string | null;
};
/**
 * Read a display identity off a Supabase user. Google lands `full_name` and
 * `picture` in user_metadata; older records and other providers use `name`
 * and `avatar_url`, so both shapes are accepted.
 */
export declare function identityFromUser(user: User): SessionIdentity;
