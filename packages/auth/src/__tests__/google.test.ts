import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const auth = {
  signInWithIdToken: vi.fn(),
  signInWithOAuth: vi.fn(),
  getUser: vi.fn(),
};
vi.mock("../server/supabase-server.js", () => ({ getSupabaseServer: async () => ({ auth }) }));

import { createGoogleCallback, createGoogleStart } from "../server/google-routes.js";
import { GOOGLE_FLOW_COOKIE, decodeFlow, encodeFlow } from "../server/google.js";

/**
 * Google sign-in on the app's own domain:
 *
 *  - the start route sends Google this origin's callback, a state and a PKCE
 *    challenge, and keeps the state, verifier and next in a scoped cookie;
 *  - unconfigured, it falls back to Supabase's hosted flow;
 *  - the callback refuses a state its cookie doesn't hold, exchanges the code
 *    WITH the verifier, signs in with the ID token, and clears the cookie on
 *    every exit;
 *  - a cancel is not an error, and no code, token or secret reaches a log.
 */
const ORIGIN = "https://app.example";
const SECRET = "GOCSPX-test-secret";
const ID_TOKEN = "eyJ.id-token.sig";
const ACCESS_TOKEN = "ya29.access-token";

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
let fetchMock: Mock<FetchFn>;
let logged: string[];

const start = (query: string, headers: Record<string, string> = {}) =>
  createGoogleStart({ defaultNext: "/home" })(new Request(`${ORIGIN}/auth/google?${query}`, { headers }));

const callback = (query: string, cookie?: string, onSignedIn?: () => Promise<void>) =>
  createGoogleCallback({ defaultNext: "/home", onSignedIn })(
    new Request(`${ORIGIN}/auth/google/callback?${query}`, {
      headers: cookie ? { cookie: `other=1; ${GOOGLE_FLOW_COOKIE}=${cookie}` } : {},
    }),
  );

const location = (res: Response) => new URL(res.headers.get("location")!);
const setCookie = (res: Response) => res.headers.get("set-cookie") ?? "";
const flowCookie = (next = "/decks/q3") =>
  encodeFlow({ state: "S".repeat(32), verifier: "V".repeat(43), next });

const tokenResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GOOGLE_SIGNIN_CLIENT_ID", "client-id.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_SIGNIN_CLIENT_SECRET", SECRET);
  fetchMock = vi.fn<FetchFn>(async () => tokenResponse(200, { id_token: ID_TOKEN, access_token: ACCESS_TOKEN }));
  vi.stubGlobal("fetch", fetchMock);
  auth.signInWithIdToken.mockResolvedValue({ error: null });
  auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://ref.supabase.co/auth/v1/authorize?x=1" }, error: null });
  auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  logged = [];
  const keep = (...args: unknown[]) => void logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  vi.spyOn(console, "error").mockImplementation(keep);
  vi.spyOn(console, "warn").mockImplementation(keep);
});
afterEach(() => {
  for (const line of logged) expect(line).not.toMatch(/GOCSPX|ya29\.|eyJ\.|the-code/);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("createGoogleStart", () => {
  it("sends Google this origin's callback, a state and an S256 challenge of the cookie's verifier", async () => {
    const res = await start("next=%2Fdecks%2Fq3");
    const google = location(res);
    expect(google.origin + google.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(google.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/auth/google/callback`);
    expect(google.searchParams.get("scope")).toBe("openid email profile");
    expect(google.searchParams.get("code_challenge_method")).toBe("S256");

    const raw = /aimhuge_google_signin=([^;]+)/.exec(setCookie(res))?.[1] ?? null;
    const flow = decodeFlow(raw);
    expect(flow?.next).toBe("/decks/q3");
    expect(google.searchParams.get("state")).toBe(flow?.state);
    expect(google.searchParams.get("code_challenge")).toBe(createHash("sha256").update(flow!.verifier).digest("base64url"));
    // The verifier itself never leaves the server.
    expect(google.href).not.toContain(flow!.verifier);
    expect(setCookie(res)).toMatch(/Path=\/auth\/google/);
    expect(setCookie(res)).toMatch(/HttpOnly/i);
    expect(setCookie(res)).toMatch(/Secure/i);
  });

  it("builds the redirect URI on the forwarded host, the one the browser used", async () => {
    const res = await start("", { "x-forwarded-host": "blastcp.com", "x-forwarded-proto": "https" });
    expect(location(res).searchParams.get("redirect_uri")).toBe("https://blastcp.com/auth/google/callback");
  });

  it("never carries an off-site next", async () => {
    for (const next of ["https://evil.com", "//evil.com", "/\\evil.com"]) {
      const res = await start(`next=${encodeURIComponent(next)}`);
      const raw = /aimhuge_google_signin=([^;]+)/.exec(setCookie(res))?.[1] ?? null;
      expect(decodeFlow(raw)?.next).toBe("/home");
    }
  });

  it("falls back to Supabase's hosted flow while the client is unset", async () => {
    vi.stubEnv("GOOGLE_SIGNIN_CLIENT_SECRET", "");
    const res = await start("next=%2Fdecks");
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `${ORIGIN}/auth/callback?next=%2Fdecks`, skipBrowserRedirect: true },
    });
    expect(location(res).href).toBe("https://ref.supabase.co/auth/v1/authorize?x=1");
  });
});

describe("createGoogleCallback", () => {
  it("exchanges the code with the verifier, signs in with the ID token, and goes on to next", async () => {
    const onSignedIn = vi.fn(async () => {});
    const res = await callback(`code=the-code&state=${"S".repeat(32)}`, flowCookie(), onSignedIn);

    const body = new URLSearchParams(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.get("code")).toBe("the-code");
    expect(body.get("code_verifier")).toBe("V".repeat(43));
    expect(body.get("redirect_uri")).toBe(`${ORIGIN}/auth/google/callback`);
    expect(body.get("client_secret")).toBe(SECRET);
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({ provider: "google", token: ID_TOKEN, access_token: ACCESS_TOKEN });
    expect(onSignedIn).toHaveBeenCalledOnce();
    expect(location(res).href).toBe(`${ORIGIN}/decks/q3`);
    expect(setCookie(res)).toMatch(/aimhuge_google_signin=;.*Max-Age=0/i);
  });

  it("refuses a state the cookie doesn't hold, or no cookie at all, before spending the code", async () => {
    for (const cookie of [flowCookie(), undefined]) {
      const res = await callback(`code=the-code&state=${"X".repeat(32)}`, cookie);
      expect(location(res).searchParams.get("reason")).toBe("state");
      expect(setCookie(res)).toMatch(/Max-Age=0/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it("takes a cancel back to the form with next and no error", async () => {
    const dest = location(await callback("error=access_denied", flowCookie()));
    expect(dest.pathname).toBe("/login");
    expect(dest.searchParams.get("next")).toBe("/decks/q3");
    expect(dest.searchParams.get("error")).toBeNull();
  });

  it("reports each failure with its own reason", async () => {
    const ok = `state=${"S".repeat(32)}`;
    expect(location(await callback("error=server_error", flowCookie())).searchParams.get("reason")).toBe("provider");
    expect(location(await callback(ok, flowCookie())).searchParams.get("reason")).toBe("nocode");

    fetchMock.mockResolvedValueOnce(tokenResponse(400, { error: "invalid_grant", error_description: "Bad Request" }));
    const refused = location(await callback(`code=the-code&${ok}`, flowCookie()));
    expect(refused.pathname).toBe("/login");
    expect(refused.searchParams.get("error")).toBe("link");
    expect(refused.searchParams.get("reason")).toBe("exchange");
    expect(logged.join("\n")).toContain("invalid_grant");

    auth.signInWithIdToken.mockResolvedValueOnce({ error: { message: "Unacceptable audience in id_token", status: 400 } });
    expect(location(await callback(`code=the-code&${ok}`, flowCookie())).searchParams.get("reason")).toBe("session");

    vi.stubEnv("GOOGLE_SIGNIN_CLIENT_ID", "");
    expect(location(await callback(`code=the-code&${ok}`, flowCookie())).searchParams.get("reason")).toBe("config");
  });

  it("treats a 200 with no ID token as a refused exchange", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse(200, { access_token: ACCESS_TOKEN }));
    const res = await callback(`code=the-code&state=${"S".repeat(32)}`, flowCookie());
    expect(location(res).searchParams.get("reason")).toBe("exchange");
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });
});
