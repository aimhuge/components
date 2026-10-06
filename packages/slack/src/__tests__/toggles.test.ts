import { describe, expect, it } from "vitest";
import { isToggleOn, resolveToggles, toggleDeviations } from "../toggles.js";

const DEFAULT = {
  alpha: true,
  beta: false,
  gamma: true,
} as const;

describe("resolveToggles", () => {
  it("fills every key from defaults when nothing is stored", () => {
    expect(resolveToggles(DEFAULT, undefined)).toEqual(DEFAULT);
    expect(resolveToggles(DEFAULT, null)).toEqual(DEFAULT);
    expect(resolveToggles(DEFAULT, {})).toEqual(DEFAULT);
  });

  it("overrides with stored values", () => {
    expect(resolveToggles(DEFAULT, { alpha: false })).toEqual({ alpha: false, beta: false, gamma: true });
    expect(resolveToggles(DEFAULT, { beta: true, gamma: false })).toEqual({ alpha: true, beta: true, gamma: false });
  });

  it("ignores non-boolean values for known keys", () => {
    expect(resolveToggles(DEFAULT, { alpha: "yes" as unknown as boolean, beta: 1 as unknown as boolean })).toEqual(DEFAULT);
  });

  it("ignores unknown keys entirely", () => {
    expect(resolveToggles(DEFAULT, { delta: false as unknown as boolean, alpha: false })).toEqual({
      alpha: false,
      beta: false,
      gamma: true,
    });
  });

  it("treats non-objects as empty (null, string, array, number)", () => {
    expect(resolveToggles(DEFAULT, "all-off" as unknown as object)).toEqual(DEFAULT);
    expect(resolveToggles(DEFAULT, 42 as unknown as object)).toEqual(DEFAULT);
    expect(resolveToggles(DEFAULT, [false] as unknown as object)).toEqual(DEFAULT);
  });
});

describe("isToggleOn", () => {
  it("returns the default for missing keys", () => {
    expect(isToggleOn(DEFAULT, undefined, "alpha")).toBe(true);
    expect(isToggleOn(DEFAULT, undefined, "beta")).toBe(false);
  });

  it("returns the stored value when present", () => {
    expect(isToggleOn(DEFAULT, { alpha: false }, "alpha")).toBe(false);
    expect(isToggleOn(DEFAULT, { beta: true }, "beta")).toBe(true);
  });

  it("ignores non-boolean stored values", () => {
    expect(isToggleOn(DEFAULT, { alpha: "no" as unknown as boolean }, "alpha")).toBe(true);
  });
});

describe("toggleDeviations", () => {
  it("returns an empty object when every choice matches the default", () => {
    expect(toggleDeviations(DEFAULT, { alpha: true, beta: false, gamma: true })).toEqual({});
    expect(toggleDeviations(DEFAULT, {})).toEqual({});
  });

  it("records only the keys that differ", () => {
    expect(toggleDeviations(DEFAULT, { alpha: false, beta: false, gamma: false })).toEqual({
      alpha: false,
      gamma: false,
    });
  });

  it("ignores unknown keys silently", () => {
    expect(
      toggleDeviations(DEFAULT, { delta: false as unknown as boolean, alpha: false } as Partial<Record<keyof typeof DEFAULT, boolean>>),
    ).toEqual({ alpha: false });
  });
});