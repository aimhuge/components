// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useShareAccess, type SaveShareAccess } from "../client/useShareAccess.js";

function setup(save: SaveShareAccess, mode: "private" | "public" | "password" = "private") {
  const onSaved = vi.fn();
  const hook = renderHook(() => useShareAccess({ save, onSaved }));
  act(() => hook.result.current.hydrate({ shareMode: mode, editRequiresEmail: true, hasPassword: mode === "password" }));
  return { hook, onSaved };
}

describe("useShareAccess", () => {
  it("starts empty until the app hydrates it", () => {
    const { result } = renderHook(() => useShareAccess({ save: vi.fn() }));
    expect(result.current.axes).toBeNull();
    expect(result.current.mode).toBeNull();
  });

  it("does nothing on an axis change before it has settings", async () => {
    const save = vi.fn();
    const { result } = renderHook(() => useShareAccess({ save }));
    await act(() => result.current.saveAxis({ audience: "link" }));
    expect(save).not.toHaveBeenCalled();
  });

  it("saves the mode an axis change adds up to", async () => {
    const save = vi.fn<SaveShareAccess>(async () => ({ ok: true }));
    const { hook, onSaved } = setup(save);
    await act(() => hook.result.current.saveAxis({ audience: "link" }));
    expect(save).toHaveBeenCalledWith({ mode: "email", editRequiresEmail: true }, undefined);
    expect(hook.result.current.mode).toBe("email");
    expect(hook.result.current.saved).toBe(true);
    expect(onSaved).toHaveBeenCalledWith("email");
  });

  it("waits for a password before saving the password gate", async () => {
    const save = vi.fn<SaveShareAccess>(async () => ({ ok: true }));
    const { hook } = setup(save, "public");
    await act(() => hook.result.current.saveAxis({ gate: "password" }));
    expect(save).not.toHaveBeenCalled();
    expect(hook.result.current.axes?.gate).toBe("password");

    act(() => hook.result.current.setPassword("hunter2"));
    await act(() => hook.result.current.savePassword());
    expect(save).toHaveBeenCalledWith({ mode: "password", editRequiresEmail: true }, "hunter2");
    expect(hook.result.current.hasPassword).toBe(true);
  });

  it("clears the password when leaving the password gate", async () => {
    const save = vi.fn<SaveShareAccess>(async () => ({ ok: true }));
    const { hook } = setup(save, "password");
    act(() => hook.result.current.setPassword("typed"));
    await act(() => hook.result.current.saveAxis({ gate: "none" }));
    expect(save).toHaveBeenCalledWith({ mode: "public", editRequiresEmail: true }, undefined);
    expect(hook.result.current.hasPassword).toBe(false);
    expect(hook.result.current.password).toBe("");
  });

  it("snaps back to the server's setting when a save is refused", async () => {
    const { hook } = setup(async () => ({ ok: false, error: "Not yours." }));
    await act(() => hook.result.current.saveAxis({ audience: "link" }));
    expect(hook.result.current.error).toBe("Not yours.");
    expect(hook.result.current.axes?.audience).toBe("private");
    expect(hook.result.current.mode).toBe("private");
  });

  it("falls back to a generic refusal message", async () => {
    const { hook } = setup(async () => ({ ok: false }));
    await act(() => hook.result.current.saveAxis({ audience: "link" }));
    expect(hook.result.current.error).toBe("Failed.");
  });

  it("reports a network failure and snaps back", async () => {
    const { hook } = setup(async () => {
      throw new Error("offline");
    });
    await act(() => hook.result.current.saveAxis({ audience: "link" }));
    expect(hook.result.current.error).toBe("Network error.");
    expect(hook.result.current.axes?.audience).toBe("private");
    expect(hook.result.current.saving).toBe(false);
  });

  it("clears the saved tick after a moment", async () => {
    vi.useFakeTimers();
    const { hook } = setup(async () => ({ ok: true }));
    await act(() => hook.result.current.saveAxis({ audience: "link" }));
    expect(hook.result.current.saved).toBe(true);
    act(() => vi.advanceTimersByTime(1500));
    expect(hook.result.current.saved).toBe(false);
    vi.useRealTimers();
  });
});
