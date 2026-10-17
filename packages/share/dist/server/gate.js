import { createHmac, timingSafeEqual } from "node:crypto";
export const DEFAULT_PASS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export function createShareGate(opts) {
    const ttlMs = opts.ttlMs ?? DEFAULT_PASS_TTL_MS;
    const now = opts.now ?? Date.now;
    const mac = (secret, payload) => createHmac("sha256", secret).update(payload).digest("hex");
    return {
        ttlMs,
        cookieName(id) {
            return `${opts.cookiePrefix}${mac(opts.nameSecret(), `name:${id}`).slice(0, 16)}`;
        },
        sign(id) {
            const secret = opts.secret("sign");
            if (!secret)
                return null;
            const expiresAt = now() + ttlMs;
            return `${expiresAt}.${mac(secret, `${id}:${expiresAt}`)}`;
        },
        verify(id, value) {
            const secret = opts.secret("verify");
            if (!secret || !value)
                return false;
            const dot = value.indexOf(".");
            if (dot < 0)
                return false;
            const expiresAt = Number(value.slice(0, dot));
            const sig = value.slice(dot + 1);
            if (!Number.isFinite(expiresAt) || expiresAt < now())
                return false;
            const a = Buffer.from(sig);
            const b = Buffer.from(mac(secret, `${id}:${expiresAt}`));
            return a.length === b.length && timingSafeEqual(a, b);
        },
        cookieOptions() {
            return {
                httpOnly: true,
                secure: opts.secure ?? process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/",
                maxAge: ttlMs / 1000,
            };
        },
    };
}
