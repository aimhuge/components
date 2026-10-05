/** The span usage is summed over for one meter. */
export function usageWindow(allowance, period) {
    const resets = allowance?.resets ?? true;
    return resets ? { start: period.start, end: period.end } : { start: null, end: null };
}
export function computeBalance(input) {
    const allowance = Math.max(0, input.allowance?.amount ?? 0);
    const now = input.now.getTime();
    const granted = input.grants
        .filter((g) => g.expiresAt === null || new Date(g.expiresAt).getTime() > now)
        .reduce((total, g) => total + Math.max(0, g.amount), 0);
    const spent = Math.max(0, input.spent);
    return {
        meter: input.meter,
        allowance,
        granted,
        spent,
        remaining: Math.max(0, allowance + granted - spent),
        window: usageWindow(input.allowance, input.period),
        resets: input.allowance?.resets ?? true,
    };
}
