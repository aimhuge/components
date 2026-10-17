import { cookies } from "next/headers";
/** Whether the current request already holds a valid pass for `id`. */
export async function hasGatePass(gate, id) {
    const store = await cookies();
    return gate.verify(id, store.get(gate.cookieName(id))?.value);
}
/** Mint a pass for `id` and set it on the response. False when the gate has no
 *  secret configured: the caller answers with an error, not an open door. */
export async function grantGatePass(gate, id) {
    const value = gate.sign(id);
    if (!value)
        return false;
    const store = await cookies();
    store.set(gate.cookieName(id), value, gate.cookieOptions());
    return true;
}
