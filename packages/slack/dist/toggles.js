/**
 * Per-event on/off toggles, stored as a jsonb object that records only
 * DEVIATIONS from a per-app default. A missing key on read means "use the
 * default" — a missing key on write means "this toggle is the default, no
 * need to persist it". The shape is the same for every event-emitting app
 * (a workspace's notify settings, an app's admin feed, …).
 */
/**
 * Fold a stored deviation map on top of `defaults`. A missing key falls back
 * to its default; a non-boolean value or an unknown key is ignored. The
 * caller is free to type the result as the same shape as `defaults`.
 */
export function resolveToggles(defaults, stored) {
    const out = { ...defaults };
    if (!stored || typeof stored !== "object")
        return out;
    for (const [k, v] of Object.entries(stored)) {
        if (typeof v === "boolean" && k in defaults)
            out[k] = v;
    }
    return out;
}
/** Convenience: a single toggle's effective value, with the default fallback. */
export function isToggleOn(defaults, stored, kind) {
    return resolveToggles(defaults, stored)[kind];
}
/**
 * The deviation map to persist: only the keys whose value differs from the
 * default. A key back at the default disappears from the row, so the stored
 * map stays minimal and a reader never has to guess what an absent key
 * meant historically.
 */
export function toggleDeviations(defaults, chosen) {
    const out = {};
    for (const k of Object.keys(defaults)) {
        const want = chosen[k];
        if (want === undefined)
            continue;
        if (want !== defaults[k])
            out[k] = want;
    }
    return out;
}
