/**
 * What each Stripe event does to the mirror. Returns the org it touched (for
 * the idempotency row), or null when the event isn't ours to act on.
 */
import type Stripe from "stripe";
import type { Service } from "../runtime.js";
import { type StripeEnv } from "./sync.js";
/** Events we act on. Anything else is acknowledged and dropped. */
export declare const HANDLED_EVENTS: Set<string>;
export declare function handleEvent(env: StripeEnv, service: Service, event: Stripe.Event): Promise<string | null>;
