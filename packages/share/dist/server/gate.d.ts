/** The signed pass a visitor gets for getting through an email or password
 *  gate. It's a cookie, self-verifying, with no session table: its value is
 *  "<expiresAtMs>.<hmac(id:expiresAtMs)>", and holding a valid, unexpired one
 *  is the pass. */
export type ShareGateOptions = {
    /** Cookie name prefix, e.g. "deck_gate_". The rest is a hash of the id,
     *  because cookie names can't hold arbitrary id characters. */
    cookiePrefix: string;
    /** The key that signs and checks an ACCESS decision. Return null when none is
     *  configured: the gate then refuses to mint or accept a pass. Never return a
     *  published constant in production, or a forged cookie walks straight in. */
    secret: (op: "sign" | "verify") => string | null;
    /** The key that hashes cookie NAMES. A namespacing device, not a security
     *  boundary, and it must stay stable or every visitor is asked again, so it
     *  always returns something (a dev constant is acceptable here). */
    nameSecret: () => string;
    /** How long a pass lasts. Default 30 days. */
    ttlMs?: number;
    /** Cookie `secure` flag. Default: on in production. */
    secure?: boolean;
    /** Clock, for tests. */
    now?: () => number;
};
export declare const DEFAULT_PASS_TTL_MS: number;
export type ShareCookieOptions = {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    path: "/";
    maxAge: number;
};
export type ShareGateKit = {
    cookieName(id: string): string;
    /** A fresh pass for `id`, or null when no secret is configured. */
    sign(id: string): string | null;
    verify(id: string, value: string | undefined): boolean;
    /** The options every share cookie uses (pass, view session, remembered
     *  email), so they all expire together. */
    cookieOptions(): ShareCookieOptions;
    ttlMs: number;
};
export declare function createShareGate(opts: ShareGateOptions): ShareGateKit;
