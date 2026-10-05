import type { User } from "@supabase/supabase-js";

/** Who the "already signed in" banner says you are. */
export type SessionIdentity = {
  name: string | null;
  avatarUrl: string | null;
  email: string | null;
};

const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

/**
 * Read a display identity off a Supabase user. Google lands `full_name` and
 * `picture` in user_metadata; older records and other providers use `name`
 * and `avatar_url`, so both shapes are accepted.
 */
export function identityFromUser(user: User): SessionIdentity {
  const meta: Record<string, unknown> = user.user_metadata ?? {};
  return {
    name: text(meta.full_name) ?? text(meta.name),
    avatarUrl: text(meta.avatar_url) ?? text(meta.picture),
    email: user.email ?? null,
  };
}
