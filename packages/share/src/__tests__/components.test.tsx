// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toAxes, type ShareAxes } from "../index.js";
import {
  CopyLinkButton,
  ShareAccessFields,
  ShareDialog,
  ShareGateForm,
  ToggleRow,
  type ShareAccessControls,
} from "../client/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function controls(axes: ShareAxes | null, extra: Partial<ShareAccessControls> = {}): ShareAccessControls {
  return {
    axes,
    saving: false,
    saved: false,
    error: null,
    saveAxis: vi.fn(),
    hasPassword: false,
    password: "",
    setPassword: vi.fn(),
    savePassword: vi.fn(),
    ...extra,
  };
}

describe("ShareAccessFields", () => {
  it("shows only Who for a private resource", () => {
    render(<ShareAccessFields s={controls(toAxes("private", true))} noun="deck" />);
    expect(screen.getByLabelText("Who can open this deck")).toBeTruthy();
    expect(screen.queryByLabelText("What link holders can do")).toBeNull();
    expect(screen.getByText(/only works for you/)).toBeTruthy();
  });

  it("asks all three questions for a link, worded for the noun", () => {
    const s = controls(toAxes("email", true));
    render(<ShareAccessFields s={s} noun="thread" />);
    fireEvent.change(screen.getByLabelText("What link holders can do"), { target: { value: "edit" } });
    expect(s.saveAxis).toHaveBeenCalledWith({ level: "edit" });
    fireEvent.change(screen.getByLabelText("What visitors hand over before the thread opens"), { target: { value: "none" } });
    expect(s.saveAxis).toHaveBeenCalledWith({ gate: "none" });
    fireEvent.change(screen.getByLabelText("Who can open this thread"), { target: { value: "private" } });
    expect(s.saveAxis).toHaveBeenCalledWith({ audience: "private" });
    expect(screen.getByText("Anyone who has the link can give their email, then read the thread.")).toBeTruthy();
  });

  it("drops the level row when the resource can't take edits", () => {
    render(<ShareAccessFields s={controls(toAxes("public", true))} allowEdit={false} />);
    expect(screen.queryByLabelText("What link holders can do")).toBeNull();
    expect(screen.getByLabelText("What visitors hand over before the page opens")).toBeTruthy();
  });

  it("shows the password field and saves it", () => {
    const s = controls(toAxes("password", true), { password: "pw" });
    render(<ShareAccessFields s={s} />);
    fireEvent.change(screen.getByLabelText("Share password"), { target: { value: "pw2" } });
    expect(s.setPassword).toHaveBeenCalledWith("pw2");
    fireEvent.click(screen.getByText("Save"));
    expect(s.savePassword).toHaveBeenCalled();
  });

  it("disables the password Save until there's something to save", () => {
    render(<ShareAccessFields s={controls(toAxes("password", true))} />);
    expect((screen.getByText("Save") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByPlaceholderText("Set a password")).toBeTruthy();
  });

  it("offers to change an existing password", () => {
    render(<ShareAccessFields s={controls(toAxes("password", true), { hasPassword: true })} />);
    expect(screen.getByPlaceholderText("Change password…")).toBeTruthy();
  });

  it("warns on an editable link and shows saving, saved and errors", () => {
    const { rerender } = render(<ShareAccessFields s={controls(toAxes("public_edit", true), { saving: true })} editLimits="No deletes." />);
    expect(screen.getByLabelText("Saving")).toBeTruthy();
    expect(screen.getByText(/change this page\. No deletes\./)).toBeTruthy();
    rerender(<ShareAccessFields s={controls(toAxes("public", true), { saved: true, error: "Nope." })} />);
    expect(screen.getByLabelText("Saved")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Nope.");
  });

  it("renders the app's own rows and a loading state", () => {
    render(
      <ShareAccessFields s={controls(null)}>
        <span>Comments row</span>
      </ShareAccessFields>,
    );
    expect(screen.getByText("Comments row")).toBeTruthy();
    expect((screen.getByLabelText("Who can open this page") as HTMLSelectElement).disabled).toBe(true);
  });
});

describe("ShareDialog", () => {
  it("closes on Escape, the backdrop, the X and Done", () => {
    const onClose = vi.fn();
    render(
      <ShareDialog title="Share “Q3”" onClose={onClose} headerAction={<span>hdr</span>} footerStart={<span>ftr</span>}>
        <p>body</p>
      </ShareDialog>,
    );
    expect(screen.getByRole("dialog", { name: "Share “Q3”" })).toBeTruthy();
    expect(screen.getByText("hdr")).toBeTruthy();
    expect(screen.getByText("ftr")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.click(screen.getByTestId("share-backdrop"));
    fireEvent.click(screen.getByLabelText("Close"));
    fireEvent.click(screen.getByText("Done"));
    expect(onClose).toHaveBeenCalledTimes(4);
  });
});

describe("CopyLinkButton", () => {
  it("copies the link, flashes Copied, then resets", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onCopied = vi.fn();
    render(<CopyLinkButton url={() => "https://x.test/s/1"} onCopied={onCopied} size="sm" tone="accent" />);
    await act(async () => {
      fireEvent.click(screen.getByText("Copy link"));
    });
    expect(writeText).toHaveBeenCalledWith("https://x.test/s/1");
    expect(onCopied).toHaveBeenCalled();
    expect(screen.getByText("Copied")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByText("Copied"));
    });
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByText("Copy link")).toBeTruthy();
  });

  it("stays quiet when the clipboard is unavailable", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: async () => Promise.reject(new Error("denied")) } });
    const { unmount } = render(<CopyLinkButton url="https://x.test" label="Copy edit link" />);
    await act(async () => {
      fireEvent.click(screen.getByText("Copy edit link"));
    });
    expect(screen.getByText("Copy edit link")).toBeTruthy();
    unmount();
  });
});

describe("ToggleRow", () => {
  it("shows On/Off, busy and disabled", () => {
    const onClick = vi.fn();
    const { rerender } = render(<ToggleRow label="Comments" sub="A panel opens" on onClick={onClick} indent />);
    fireEvent.click(screen.getByText("Comments"));
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByText("On")).toBeTruthy();
    rerender(<ToggleRow label="Comments" on disabled onClick={onClick} />);
    expect(screen.getByText("Off")).toBeTruthy();
    rerender(<ToggleRow label="Comments" on={false} busy icon={() => <i>ic</i>} onClick={onClick} />);
    expect(screen.queryByText("Off")).toBeNull();
    expect(screen.getByText("ic")).toBeTruthy();
  });
});

describe("ShareGateForm", () => {
  function stubFetch(response: { ok: boolean; body?: unknown } | Error) {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/seen")) return { ok: true, json: async () => ({}) };
      if (response instanceof Error) throw response;
      return { ok: response.ok, json: async () => response.body ?? {} };
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("unlocks an email gate: pings seen once, posts the email, identifies, reloads", async () => {
    const fetchMock = stubFetch({ ok: true });
    const reload = vi.fn();
    const onUnlocked = vi.fn();
    render(
      <ShareGateForm
        title="Q3 plan"
        mode="email"
        noun="deck"
        unlockUrl="/api/gate"
        seenUrl="/api/gate/seen"
        knownEmail=" Ann@X.test "
        onUnlocked={onUnlocked}
        reload={reload}
      />,
    );
    expect(screen.getByText("Confirm your email to view this deck.")).toBeTruthy();
    fireEvent.click(screen.getByText("View deck"));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/gate/seen", { method: "POST" });
    expect(fetchMock).toHaveBeenCalledWith("/api/gate", expect.objectContaining({ body: JSON.stringify({ email: " Ann@X.test " }) }));
    expect(onUnlocked).toHaveBeenCalledWith("ann@x.test");
  });

  it("asks a password gate for the password and shows the server's refusal", async () => {
    stubFetch({ ok: false, body: { error: "Wrong password." } });
    render(<ShareGateForm title="T" mode="password" unlockUrl="/u" seenUrl="/u/seen" reload={vi.fn()} />);
    expect(screen.getByText("This page is password-protected. Enter the password to continue.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "nope" } });
    fireEvent.click(screen.getByText("Unlock"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Wrong password.");
  });

  it("falls back to generic errors", async () => {
    stubFetch({ ok: false });
    const { unmount } = render(<ShareGateForm title="T" mode="password" unlockUrl="/u" reload={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Unlock"));
    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong.");
    unmount();

    stubFetch(new Error("offline"));
    render(<ShareGateForm title="T" mode="password" unlockUrl="/u" reload={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Unlock"));
    expect((await screen.findByRole("alert")).textContent).toBe("Network error. Try again.");
  });

  it("words the edit door, with and without a known email", () => {
    stubFetch({ ok: true });
    const { rerender } = render(<ShareGateForm title="T" mode="email" purpose="edit" noun="deck" unlockUrl="/u" />);
    expect(screen.getByText("This deck is open for editing. Enter your email so your changes have a name on them.")).toBeTruthy();
    expect(screen.getByText("Start editing")).toBeTruthy();
    rerender(<ShareGateForm title="T" mode="email" purpose="edit" noun="deck" unlockUrl="/u" knownEmail="a@b.c" />);
    expect(screen.getByText(/Confirm your email to edit this deck/)).toBeTruthy();
    rerender(<ShareGateForm title="T" mode="email" unlockUrl="/u" knownEmail={null} />);
    expect(screen.getByText("Enter your email to view this page.")).toBeTruthy();
  });
});
