import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, { value: string; opts?: unknown }>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, opts?: unknown) => jar.set(name, { value, opts }),
  }),
}));

const {
  createShareGate,
  DEFAULT_PASS_TTL_MS,
  grantGatePass,
  hasGatePass,
  hashSharePassword,
  verifySharePassword,
} = await import("../server/index.js");

const SECRET = "test-secret";
let clock = 1_000_000;
const gate = createShareGate({
  cookiePrefix: "deck_gate_",
  secret: () => SECRET,
  nameSecret: () => SECRET,
  now: () => clock,
  secure: true,
});

beforeEach(() => {
  jar.clear();
  clock = 1_000_000;
});

describe("createShareGate", () => {
  it("signs a pass that verifies for its id only", () => {
    const pass = gate.sign("q3-plan")!;
    expect(gate.verify("q3-plan", pass)).toBe(true);
    expect(gate.verify("other", pass)).toBe(false);
  });

  it("produces exactly DeckCP's legacy cookie name and pass, so nobody is re-gated", () => {
    const tag = createHmac("sha256", SECRET).update("name:q3-plan").digest("hex").slice(0, 16);
    expect(gate.cookieName("q3-plan")).toBe(`deck_gate_${tag}`);
    const expiresAt = clock + DEFAULT_PASS_TTL_MS;
    const sig = createHmac("sha256", SECRET).update(`q3-plan:${expiresAt}`).digest("hex");
    expect(gate.sign("q3-plan")).toBe(`${expiresAt}.${sig}`);
  });

  it("refuses an expired, malformed or tampered pass", () => {
    const pass = gate.sign("q3-plan")!;
    expect(gate.verify("q3-plan", undefined)).toBe(false);
    expect(gate.verify("q3-plan", "nodot")).toBe(false);
    expect(gate.verify("q3-plan", "abc.def")).toBe(false);
    expect(gate.verify("q3-plan", `${pass}0`)).toBe(false);
    clock += DEFAULT_PASS_TTL_MS + 1;
    expect(gate.verify("q3-plan", pass)).toBe(false);
  });

  it("fails closed with no secret: no pass minted, none accepted", () => {
    const closed = createShareGate({ cookiePrefix: "x_", secret: () => null, nameSecret: () => "n" });
    expect(closed.sign("a")).toBeNull();
    expect(closed.verify("a", gate.sign("a")!)).toBe(false);
  });

  it("tells the secret which operation it serves", () => {
    const secret = vi.fn(() => SECRET);
    const g = createShareGate({ cookiePrefix: "x_", secret, nameSecret: () => "n" });
    g.verify("a", g.sign("a")!);
    expect(secret.mock.calls).toEqual([["sign"], ["verify"]]);
  });

  it("hands out one set of cookie options for every share cookie", () => {
    expect(gate.cookieOptions()).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: DEFAULT_PASS_TTL_MS / 1000,
    });
    const dflt = createShareGate({ cookiePrefix: "x_", secret: () => "s", nameSecret: () => "n", ttlMs: 60_000 });
    expect(dflt.cookieOptions().maxAge).toBe(60);
    expect(dflt.cookieOptions().secure).toBe(process.env.NODE_ENV === "production");
  });
});

describe("request helpers", () => {
  it("grants a pass cookie the next request recognises", async () => {
    expect(await hasGatePass(gate, "q3-plan")).toBe(false);
    expect(await grantGatePass(gate, "q3-plan")).toBe(true);
    expect(jar.get(gate.cookieName("q3-plan"))?.opts).toEqual(gate.cookieOptions());
    expect(await hasGatePass(gate, "q3-plan")).toBe(true);
  });

  it("grants nothing when the gate can't sign", async () => {
    const closed = createShareGate({ cookiePrefix: "x_", secret: () => null, nameSecret: () => "n" });
    expect(await grantGatePass(closed, "a")).toBe(false);
    expect(jar.size).toBe(0);
  });
});

describe("share passwords", () => {
  it("hashes with a fresh salt and verifies only the right password", () => {
    const stored = hashSharePassword("hunter2");
    expect(stored).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(hashSharePassword("hunter2")).not.toBe(stored);
    expect(verifySharePassword("hunter2", stored)).toBe(true);
    expect(verifySharePassword("hunter3", stored)).toBe(false);
  });

  it("refuses a missing or foreign hash", () => {
    expect(verifySharePassword("x", null)).toBe(false);
    expect(verifySharePassword("x", "bcrypt$a$b")).toBe(false);
    expect(verifySharePassword("x", "scrypt$abc")).toBe(false);
    expect(verifySharePassword("x", "scrypt$ab$cd$ef")).toBe(false);
  });
});
