const text = (value) => (typeof value === "string" && value ? value : null);
/**
 * Read a display identity off a Supabase user. Google lands `full_name` and
 * `picture` in user_metadata; older records and other providers use `name`
 * and `avatar_url`, so both shapes are accepted.
 */
export function identityFromUser(user) {
    const meta = user.user_metadata ?? {};
    return {
        name: text(meta.full_name) ?? text(meta.name),
        avatarUrl: text(meta.avatar_url) ?? text(meta.picture),
        email: user.email ?? null,
    };
}
