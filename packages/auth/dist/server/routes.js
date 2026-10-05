/** `/login?error=link&reason=…` — the form reads `error=link` and says the link expired. */
export function failRedirect(origin, loginPath, reason) {
    const dest = new URL(loginPath, origin);
    dest.searchParams.set("error", "link");
    dest.searchParams.set("reason", reason);
    return dest;
}
export async function runOnSignedIn(label, request, supabase, onSignedIn) {
    if (!onSignedIn)
        return;
    try {
        const { data: { user }, } = await supabase.auth.getUser();
        await onSignedIn({ request, supabase, user });
    }
    catch (e) {
        console.error(`[${label}] onSignedIn failed:`, e);
    }
}
