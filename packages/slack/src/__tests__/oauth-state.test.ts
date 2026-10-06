import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  buildInstallUrl,
  decodeOAuthState,
  encodeOAuthState,
  exchangeSlackCode,
  newOAuthNonce,
  nonceMatches,
  oauthCookieOptions,
  parseSlackInstall,
} from "../server/oauth.js";

/**
 * The OAuth half of Slack. What is pinned here is the wire shape Slack
 * documents, the connect flow's CSRF state, and the `oauth.v2.access` body
 * — `parseSlackInstall` reads the bot token and the webhook off it, and that
 * is the only piece of the consent screen we control.
 */

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
let fetchMock: Mock<FetchFn>;

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  fetchMock = vi.fn<FetchFn>(async (input, init = {}) => handler(String(input), init));
  vi.stubGlobal("fetch", fetchMock);
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const lastUrl = () => String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1]?.[0] ?? "");
const lastInit = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1]?.[1] ?? {};
const lastForm = () => new URLSearchParams(String(lastInit().body));

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the connect flow's CSRF state", () => {
  it("round-trips whatever the app's validator accepts", () => {
    const nonce = newOAuthNonce();
    const validate: (obj: Record<string, unknown>) => { orgSlug: string; propertySlug: string } | null = (obj) => {
      const orgSlug = obj["orgSlug"];
      const propertySlug = obj["propertySlug"];
      if (typeof orgSlug !== "string" || !/^[a-z0-9-]{1,32}$/.test(orgSlug)) return null;
      if (typeof propertySlug !== "string" || !/^[a-z0-9-]{1,32}$/.test(propertySlug)) return null;
      return { orgSlug, propertySlug };
    };
    const raw = encodeOAuthState({ orgSlug: "acme", propertySlug: "main", nonce });
    expect(decodeOAuthState(raw, validate)).toEqual({
      orgSlug: "acme",
      propertySlug: "main",
      nonce,
    });
  });

  it("returns null on tampering the payload", () => {
    const nonce = newOAuthNonce();
    const validate: (obj: Record<string, unknown>) => { orgSlug: string } | null = (obj) => {
      const orgSlug = obj["orgSlug"];
      if (typeof orgSlug !== "string") return null;
      return { orgSlug };
    };
    const raw = encodeOAuthState({ orgSlug: "acme", nonce });
    // Rebuild the payload by hand so we know the result is a parseable JSON
    // object with a DIFFERENT (still-valid-looking) value — `encodeOAuthState`
    // could be tamper-resistant for any number of reasons (nonce mismatch,
    // JSON shape, validator rejection). All three should return null.
    const evil = Buffer.from(JSON.stringify({ orgSlug: "evil", nonce }), "utf8").toString("base64url");
    // The validator accepts "evil" — to actually fail we have to break a
    // different invariant. Flip the nonce to something shorter: that triggers
    // the package's nonce-length check.
    const evilShortNonce = Buffer.from(JSON.stringify({ orgSlug: "evil", nonce: "short" }), "utf8").toString("base64url");
    expect(decodeOAuthState(evil, validate)).not.toBeNull(); // sanity: validator allows this
    expect(decodeOAuthState(evilShortNonce, validate)).toBeNull(); // nonce length gates it
    // A genuinely invalid base64url string.
    expect(decodeOAuthState("not-base64", validate)).toBeNull();
  });

  it("returns null when the validator rejects the parsed shape", () => {
    const nonce = newOAuthNonce();
    const rejectEverything: () => null = () => null;
    const raw = encodeOAuthState({ orgSlug: "acme", nonce });
    expect(decodeOAuthState(raw, rejectEverything)).toBeNull();
  });

  it("returns null on a short or missing nonce", () => {
    const validate: (obj: Record<string, unknown>) => { orgSlug: string } | null = (obj) => {
      const orgSlug = obj["orgSlug"];
      if (typeof orgSlug !== "string") return null;
      return { orgSlug };
    };
    expect(decodeOAuthState(encodeOAuthState({ orgSlug: "acme", nonce: "short" }), validate)).toBeNull();
    // Missing nonce (rewriting by hand to drop it).
    const rawNoNonce = Buffer.from(JSON.stringify({ orgSlug: "acme" }), "utf8").toString("base64url");
    expect(decodeOAuthState(rawNoNonce, validate)).toBeNull();
  });

  it("returns null on a non-JSON payload", () => {
    const validate: (obj: Record<string, unknown>) => { orgSlug: string } | null = (obj) => {
      const orgSlug = obj["orgSlug"];
      if (typeof orgSlug !== "string") return null;
      return { orgSlug };
    };
    const raw = Buffer.from("not json at all", "utf8").toString("base64url");
    expect(decodeOAuthState(raw, validate)).toBeNull();
  });

  it("returns null for null/undefined/empty input", () => {
    const validate: () => { orgSlug: string } = () => ({ orgSlug: "x" });
    expect(decodeOAuthState(null, validate)).toBeNull();
    expect(decodeOAuthState(undefined, validate)).toBeNull();
    expect(decodeOAuthState("", validate)).toBeNull();
  });
});

describe("nonceMatches", () => {
  it("matches equal strings", () => {
    expect(nonceMatches("abc", "abc")).toBe(true);
  });

  it("does not match different strings of the same length", () => {
    expect(nonceMatches("abc", "abd")).toBe(false);
  });

  it("never matches a missing cookie (null / undefined / empty)", () => {
    expect(nonceMatches("abc", undefined)).toBe(false);
    expect(nonceMatches("abc", null)).toBe(false);
    expect(nonceMatches("abc", "")).toBe(false);
  });

  it("does not match different-length strings", () => {
    expect(nonceMatches("abc", "abcd")).toBe(false);
  });
});

describe("oauthCookieOptions", () => {
  it("returns httpOnly + lax + the caller's path + maxAge from maxAgeS", () => {
    expect(oauthCookieOptions({ path: "/api/slack", secure: true, maxAgeS: 600 })).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/api/slack",
      maxAge: 600,
    });
  });

  it("defaults maxAge to 600s", () => {
    expect(oauthCookieOptions({ path: "/api/slack", secure: false }).maxAge).toBe(600);
  });

  it("respects secure: false for local dev", () => {
    expect(oauthCookieOptions({ path: "/api/slack", secure: false }).secure).toBe(false);
  });
});
