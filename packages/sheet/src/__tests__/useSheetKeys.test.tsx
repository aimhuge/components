// @vitest-environment jsdom
// The keyboard listener: a printable key searches, Space then a leader key leads, and nothing fires in a field or
// while something is open over the sheet — a dialog by default, or what the app's blocked() says.
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSheetKeys, type SheetKeyHandlers } from "../client/useSheetKeys.js";

function Keys(props: SheetKeyHandlers<"backlog">) {
  const leader = useSheetKeys(props);
  return <span data-testid="leader">{leader ? "on" : "off"}</span>;
}

describe("useSheetKeys", () => {
  it("searches on a printable key, and leads after Space", () => {
    const onSearch = vi.fn();
    const onLead = vi.fn();
    const view = render(<Keys leaders={{ b: "backlog" }} onSearch={onSearch} onLead={onLead} />);
    fireEvent.keyDown(document.body, { key: "x" });
    expect(onSearch).toHaveBeenCalledWith("x");
    fireEvent.keyDown(document.body, { key: " " });
    expect(view.getByTestId("leader")).toHaveTextContent("on");
    fireEvent.keyDown(document.body, { key: "b" });
    expect(onLead).toHaveBeenCalledWith("backlog");
    expect(view.getByTestId("leader")).toHaveTextContent("off");
  });

  it("stands aside in a field, and while a dialog is open", () => {
    const onSearch = vi.fn();
    const view = render(
      <>
        <Keys onSearch={onSearch} />
        <input aria-label="field" />
      </>,
    );
    fireEvent.keyDown(view.getByLabelText("field"), { key: "x" });
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    fireEvent.keyDown(document.body, { key: "y" });
    dialog.remove();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("asks the app what counts as open over the sheet", () => {
    const onSearch = vi.fn();
    render(<Keys onSearch={onSearch} blocked={() => true} />);
    fireEvent.keyDown(document.body, { key: "x" });
    expect(onSearch).not.toHaveBeenCalled();
  });
});
