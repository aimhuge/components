"use client";

// A sheet's keyboard listener (rules in ../keys.ts): type anywhere to search, and Space then a key for the
// sheet's own leaders. It listens in the capture phase, so a letter the sheet takes never reaches a page shortcut,
// and it steps aside whenever something is open over the sheet: a dialog or a menu, or what the app's blocked() says. Returns whether Space is waiting for its second key.
import { useEffect, useRef, useState } from "react";
import { isTyping } from "./isTyping.js";
import { LEADER_MS, sheetKey, type SheetKeyOptions } from "../keys.js";

export interface SheetKeyHandlers<L extends string> extends SheetKeyOptions<L> {
  onSearch: (text: string) => void;
  onLead?: (to: L) => void;
  // Something is open over the sheet, so keys belong to it; by default any dialog or menu (role="dialog").
  blocked?: () => boolean;
}

function anyDialog() {
  return Boolean(document.querySelector('[role="dialog"]'));
}

export function useSheetKeys<L extends string = never>(handlers: SheetKeyHandlers<L>) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  const [leader, setLeader] = useState(false);
  const leading = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const lead = (on: boolean) => {
      leading.current = on;
      setLeader(on);
      clearTimeout(timer);
      if (on) timer = setTimeout(() => lead(false), LEADER_MS);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const was = leading.current;
      const event = { key: e.key, meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, typing: isTyping(e.target), blocked: (latest.current.blocked ?? anyDialog)() };
      const action = sheetKey(event, was, latest.current);
      if (was) lead(false);
      if (action.kind === "pass") return;
      e.preventDefault();
      e.stopPropagation();
      if (action.kind === "leader") lead(true);
      else if (action.kind === "lead") latest.current.onLead?.(action.to);
      else latest.current.onSearch(action.text);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  return leader;
}
