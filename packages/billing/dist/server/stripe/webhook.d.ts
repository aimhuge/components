import type { Service } from "../runtime.js";
import type { StripeEnv } from "./sync.js";
export declare function handleStripeWebhook(env: StripeEnv, req: Request, getService: () => Service | null): Promise<Response>;
