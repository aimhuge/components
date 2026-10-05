export async function syncPaymentMethods(service, orgId, methods, defaultPaymentMethodId) {
    const ids = methods.map((m) => m.id);
    const gone = service.from("org_payment_methods").delete().eq("org_id", orgId).eq("provider", "stripe");
    await (ids.length === 0 ? gone : gone.not("provider_payment_method_id", "in", `(${ids.join(",")})`));
    // Clear defaults first: the partial unique index allows exactly one, and an
    // upsert batch has no ordering guarantee between its rows.
    await service.from("org_payment_methods").update({ is_default: false }).eq("org_id", orgId).eq("is_default", true);
    for (const method of methods) {
        const card = method.card;
        if (!card)
            continue;
        const { error } = await service.from("org_payment_methods").upsert({
            org_id: orgId,
            brand: card.brand ?? "card",
            last4: card.last4 ?? "0000",
            exp_month: card.exp_month ?? 1,
            exp_year: card.exp_year ?? 2100,
            holder_name: method.billing_details?.name ?? null,
            is_default: false,
            provider: "stripe",
            provider_payment_method_id: method.id,
        }, { onConflict: "org_id,provider_payment_method_id" });
        if (error)
            throw new Error(`Payment method sync failed: ${error.message}`);
    }
    if (defaultPaymentMethodId) {
        await service
            .from("org_payment_methods")
            .update({ is_default: true })
            .eq("org_id", orgId)
            .eq("provider_payment_method_id", defaultPaymentMethodId);
    }
}
/** Pull a customer's cards from Stripe and mirror them. */
export async function refreshPaymentMethods(service, stripe, orgId, customerId) {
    const [methods, customer] = await Promise.all([
        stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 20 }),
        stripe.customers.retrieve(customerId),
    ]);
    // A deleted customer has no invoice_settings; treat it as no default.
    const raw = customer && !customer.deleted ? customer.invoice_settings?.default_payment_method : null;
    const defaultId = typeof raw === "string" ? raw : (raw?.id ?? null);
    await syncPaymentMethods(service, orgId, methods.data, defaultId);
}
