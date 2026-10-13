import { describe, it, expect } from "vitest";
import { mintInviteToken, inviteClaimUrl, inviteEmailBody } from "../invites.js";

describe("mintInviteToken", () => {
  it("returns a 43-char base64url string", () => {
    const t = mintInviteToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("mints distinct tokens", () => {
    const a = mintInviteToken();
    const b = mintInviteToken();
    expect(a).not.toBe(b);
  });
});

describe("inviteClaimUrl", () => {
  it("builds origin + /invite/<token>", () => {
    const url = inviteClaimUrl("abc");
    expect(url).toMatch(/\/invite\/abc$/);
  });
});

describe("inviteEmailBody", () => {
  it("includes the org name, role, claim URL, and inviter", () => {
    const text = inviteEmailBody({
      orgName: "Acme",
      role: "member",
      claimUrl: "https://example.com/invite/abc",
      inviterEmail: "owner@acme.com",
    });
    expect(text).toContain("Acme");
    expect(text).toContain("member");
    expect(text).toContain("https://example.com/invite/abc");
    expect(text).toContain("owner@acme.com");
  });
  it("falls back when inviter email is missing", () => {
    const text = inviteEmailBody({
      orgName: "Acme",
      role: "admin",
      claimUrl: "https://example.com/invite/abc",
      inviterEmail: null,
    });
    expect(text).toContain("A workspace owner");
  });
});