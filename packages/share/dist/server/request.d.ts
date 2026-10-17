import type { ShareGateKit } from "./gate.js";
/** Whether the current request already holds a valid pass for `id`. */
export declare function hasGatePass(gate: ShareGateKit, id: string): Promise<boolean>;
/** Mint a pass for `id` and set it on the response. False when the gate has no
 *  secret configured: the caller answers with an error, not an open door. */
export declare function grantGatePass(gate: ShareGateKit, id: string): Promise<boolean>;
