import { describe, expect, it } from "vitest";
import { safeNextPath } from "../next-path.js";

describe("safeNextPath", () => {
  it("keeps a same-origin path with its query and hash", () => {
    expect(safeNextPath("/decks/q3?remix=1#slide-4", "/home")).toBe("/decks/q3?remix=1#slide-4");
  });

  it("falls back when there is nothing usable", () => {
    expect(safeNextPath(undefined, "/home")).toBe("/home");
    expect(safeNextPath(null, "/home")).toBe("/home");
    expect(safeNextPath("", "/home")).toBe("/home");
    expect(safeNextPath("decks", "/home")).toBe("/home");
  });

  it("takes the first value of a repeated param", () => {
    expect(safeNextPath(["/a", "/b"], "/home")).toBe("/a");
  });

  it("refuses full and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.com/x", "/home")).toBe("/home");
    expect(safeNextPath("//evil.com/x", "/home")).toBe("/home");
  });

  // The cases a startsWith("/") && !startsWith("//") check let through: a
  // browser resolves each of these to //evil.com.
  it("refuses paths a browser would read as another host", () => {
    expect(safeNextPath("/\\evil.com", "/home")).toBe("/home");
    expect(safeNextPath("/\t/evil.com", "/home")).toBe("/home");
    expect(safeNextPath("/\n/evil.com", "/home")).toBe("/home");
  });

  it("keeps an encoded slash as a path, which is where it resolves", () => {
    expect(safeNextPath("/%2F%2Fevil.com", "/home")).toBe("/%2F%2Fevil.com");
  });
});
