import { describe, it, expect } from "vitest";
import { ORG_ROLES } from "../members.js";

describe("ORG_ROLES", () => {
  it("is owner, admin, member in seniority order", () => {
    expect(ORG_ROLES).toEqual(["owner", "admin", "member"]);
  });
});