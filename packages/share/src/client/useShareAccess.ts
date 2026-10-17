"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toAxes, toMode, withAxis, type ShareAccess, type ShareAxes } from "../axes.js";
import type { ShareMode } from "../modes.js";

/** What the app's server says the resource is shared as. */
export type ShareAccessSnapshot = {
  shareMode: ShareMode;
  editRequiresEmail: boolean;
  hasPassword: boolean;
};

/** The app's write. Return `{ ok: false, error }` for a refusal the server
 *  explained; throw for a network failure. */
export type SaveShareAccess = (
  access: ShareAccess,
  password: string | undefined,
) => Promise<{ ok: boolean; error?: string }>;

export type UseShareAccessOptions = {
  save: SaveShareAccess;
  /** After a change has been saved, e.g. for analytics. */
  onSaved?: (mode: ShareMode) => void;
};

const SAVED_FLASH_MS = 1500;

/** The general-access state behind the Share dialog: the stored mode, the three
 *  axes the dialog shows, the password field, and saving.
 *
 *  `axes` is normally just `toAxes(mode, editRequiresEmail)`, but it leads the
 *  server by one step in the one case that can't be saved yet: choosing the
 *  password gate before a password exists has to render the field first, and a
 *  save would only be refused. It snaps back to the server's answer when a save
 *  fails, so a rejected change never leaves the UI claiming it stuck.
 *
 *  Nothing loads here: the app fetches its settings and calls `hydrate`. */
export function useShareAccess({ save, onSaved }: UseShareAccessOptions) {
  const [mode, setMode] = useState<ShareMode | null>(null);
  const [editRequiresEmail, setEditRequiresEmail] = useState(true);
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [axes, setAxes] = useState<ShareAxes | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flash = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (flash.current) clearTimeout(flash.current);
  }, []);

  const hydrate = useCallback((s: ShareAccessSnapshot) => {
    setMode(s.shareMode);
    setEditRequiresEmail(s.editRequiresEmail);
    setHasPassword(s.hasPassword);
    setAxes(toAxes(s.shareMode, s.editRequiresEmail));
  }, []);

  /** Persist one access decision. Mode and the link-edit gate travel together
   *  because the three axes can move both at once (view → edit while the email
   *  gate stays on is one gesture, not two). */
  async function persist(access: ShareAccess, chosen: ShareAxes) {
    setSaving(true);
    setError(null);
    setSaved(false);
    const revert = () => {
      if (mode) setAxes(toAxes(mode, editRequiresEmail));
    };
    try {
      const res = await save(access, access.mode === "password" ? password || undefined : undefined);
      if (!res.ok) {
        setError(res.error || "Failed.");
        revert();
        setSaving(false);
        return;
      }
      setMode(access.mode);
      setEditRequiresEmail(access.editRequiresEmail);
      setAxes(chosen);
      if (access.mode === "password" && password) setHasPassword(true);
      if (access.mode !== "password") {
        setHasPassword(false);
        setPassword("");
      }
      setSaved(true);
      onSaved?.(access.mode);
      if (flash.current) clearTimeout(flash.current);
      flash.current = setTimeout(() => setSaved(false), SAVED_FLASH_MS);
    } catch {
      setError("Network error.");
      revert();
    }
    setSaving(false);
  }

  /** Move one axis and save the mode that combination adds up to. */
  async function saveAxis(patch: Partial<ShareAxes>) {
    const current = axes ?? (mode ? toAxes(mode, editRequiresEmail) : null);
    if (!current) return;
    const next = withAxis(current, patch);
    setAxes(next);
    setError(null);
    const access = toMode(next);
    // Password mode with no secret yet: show the field and wait for it.
    if (access.mode === "password" && !hasPassword && !password) return;
    await persist(access, next);
  }

  /** The password field's own Save, the second half of choosing that gate. */
  async function savePassword() {
    const gate: Partial<ShareAxes> = { audience: "link", level: "view", gate: "password" };
    const next = withAxis(axes ?? { audience: "link", level: "view", gate: "password" }, gate);
    setAxes(next);
    await persist(toMode(next), next);
  }

  return {
    mode,
    axes,
    editRequiresEmail,
    hasPassword,
    password,
    setPassword,
    saving,
    saved,
    error,
    hydrate,
    saveAxis,
    savePassword,
  };
}

export type ShareAccessState = ReturnType<typeof useShareAccess>;
