import { cookies } from "next/headers";
import type { ShareGateKit } from "./gate.js";

/** Whether the current request already holds a valid pass for `id`. */
export async function hasGatePass(gate: ShareGateKit, id: string): Promise<boolean> {
  const store = await cookies();
  return gate.verify(id, store.get(gate.cookieName(id))?.value);
}

/** Mint a pass for `id` and set it on the response. False when the gate has no
 *  secret configured: the caller answers with an error, not an open door. */
export async function grantGatePass(gate: ShareGateKit, id: string): Promise<boolean> {
  const value = gate.sign(id);
  if (!value) return false;
  const store = await cookies();
  store.set(gate.cookieName(id), value, gate.cookieOptions());
  return true;
}
