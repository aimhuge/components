import type { PaymentMethod } from "../types.js";
import type { AttachPaymentMethodInput, BillingContext } from "./provider.js";
import { type PaymentMethodRow } from "./rows.js";
import type { Runtime } from "./runtime.js";
export type StoredMethod = PaymentMethodRow & {
    provider_payment_method_id: string | null;
};
export declare function defaultPaymentMethod(ctx: BillingContext): Promise<StoredMethod | null>;
/**
 * "Charge" a card: the outcome was decided when the test number was chosen.
 * A zero-or-negative amount always succeeds — a credit note isn't a charge,
 * and declining one would fail a downgrade for no reason.
 */
export declare function charge(ctx: BillingContext, method: StoredMethod, amountCents: number): Promise<{
    ok: boolean;
    reason: string;
}>;
export declare function attachMockCard(ctx: BillingContext, input: AttachPaymentMethodInput): Promise<PaymentMethod>;
export declare function detachMockCard(rt: Runtime, ctx: BillingContext, paymentMethodId: string): Promise<void>;
export declare function setDefaultMockCard(ctx: BillingContext, paymentMethodId: string): Promise<void>;
