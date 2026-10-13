import { describe, it, expect } from "vitest";
import {
  roleCan,
  roleAtLeast,
  assignableRoles,
  roleLabel,
  roleDescription,
  effectivePermissions,
} from "../permissions.js";

describe("roleCan", () => {
  it("grants workspace.manage to owners and admins only", () => {
    expect(roleCan("owner", "workspace.manage")).toBe(true);
    expect(roleCan("admin", "workspace.manage")).toBe(true);
    expect(roleCan("member", "workspace.manage")).toBe(false);
  });

  it("grants posts.publish to every role", () => {
    expect(roleCan("owner", "posts.publish")).toBe(true);
    expect(roleCan("admin", "posts.publish")).toBe(true);
    expect(roleCan("member", "posts.publish")).toBe(true);
  });

  it("denies unknown permission to all roles", () => {
    expect(roleCan("owner", "made.up" as never)).toBe(false);
  });
});

describe("roleAtLeast", () => {
  it("treats owner > admin > member", () => {
    expect(roleAtLeast("owner", "member")).toBe(true);
    expect(roleAtLeast("owner", "admin")).toBe(true);
    expect(roleAtLeast("admin", "owner")).toBe(false);
    expect(roleAtLeast("member", "admin")).toBe(false);
  });
});

describe("assignableRoles", () => {
  it("owners can assign anyone", () => {
    expect(assignableRoles("owner").sort()).toEqual(["admin", "member", "owner"]);
  });
  it("admins cannot grant owner", () => {
    expect(assignableRoles("admin").sort()).toEqual(["admin", "member"]);
  });
  it("members cannot assign anyone", () => {
    expect(assignableRoles("member")).toEqual([]);
  });
});

describe("roleLabel / roleDescription", () => {
  it("returns a non-empty label and description for every role", () => {
    for (const r of ["owner", "admin", "member"] as const) {
      expect(roleLabel(r).length).toBeGreaterThan(0);
      expect(roleDescription(r).length).toBeGreaterThan(0);
    }
  });
});

describe("effectivePermissions", () => {
  it("super-admins hold every permission regardless of role", () => {
    const set = effectivePermissions("member", true);
    expect(set.has("workspace.manage")).toBe(true);
    expect(set.has("members.manage")).toBe(true);
    expect(set.has("posts.publish")).toBe(true);
  });
  it("non-super-admins are limited to their role's table", () => {
    expect(effectivePermissions("member", false).has("workspace.manage")).toBe(false);
    expect(effectivePermissions("owner", false).has("workspace.manage")).toBe(true);
  });
});