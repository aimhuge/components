"use client";

import type { ComponentType, ReactNode } from "react";
import { Check, Eye, Loader2, Pencil } from "lucide-react";
import {
  AUDIENCE_LABEL,
  AUDIENCE_OPTIONS,
  LEVEL_LABEL,
  LEVEL_OPTIONS,
  consequenceOf,
  gateLabels,
  gateOptionsFor,
  type ShareAudience,
  type ShareAxes,
  type ShareGate,
  type ShareLevel,
} from "../axes.js";
import { AUDIENCE_ICON, GATE_ICON } from "./icons.js";

/** The slice of `useShareAccess` this section draws. An app with its own hook
 *  passes anything of this shape. */
export type ShareAccessControls = {
  axes: ShareAxes | null;
  saving: boolean;
  saved: boolean;
  error: string | null;
  saveAxis: (patch: Partial<ShareAxes>) => unknown;
  hasPassword: boolean;
  password: string;
  setPassword: (value: string) => void;
  savePassword: () => unknown;
};

/** "General access": the resource-wide share mode, asked as the three questions
 *  it actually is instead of one fused enum:
 *
 *    Who can open it   →  private / anyone with the link
 *    What they can do  →  view / view and edit     (hidden when allowEdit is false)
 *    Asked for first   →  nothing / an email / a password   (link only)
 *
 *  A single select made people decode combinations ("Anyone with the link can
 *  edit": gated or not?). The axes module owns the mapping back to the mode and
 *  refuses to emit a combination the schema can't hold.
 *
 *  `children` render under the consequence line: the app's own access toggles
 *  (DeckCP's comment settings). */
export function ShareAccessFields({
  s,
  noun = "page",
  allowEdit = true,
  editLimits,
  children,
}: {
  s: ShareAccessControls;
  /** What's being shared, in copy: "deck", "thread", "page". */
  noun?: string;
  /** False for a resource strangers can't write to; the level row disappears. */
  allowEdit?: boolean;
  /** One sentence on what a link-editor still can't do. */
  editLimits?: string;
  children?: ReactNode;
}) {
  const axes = s.axes;
  const loading = axes === null;
  const shared = axes?.audience === "link";
  const AudienceIcon = AUDIENCE_ICON[axes?.audience ?? "private"];
  const GateIcon = GATE_ICON[axes?.gate ?? "none"];
  const gateLabel = gateLabels(noun);

  return (
    <div className="mt-4 pt-4 border-t border-share-line">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[11px] font-mono uppercase tracking-widest text-share-muted">General access</p>
        {s.saving ? (
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-share-muted" aria-label="Saving" />
        ) : s.saved ? (
          <Check className="w-3.5 h-3.5 shrink-0 text-share-ok" aria-label="Saved" />
        ) : null}
      </div>

      <AxisRow label="Who" icon={AudienceIcon} active={shared}>
        <select
          value={axes?.audience ?? "private"}
          onChange={(e) => s.saveAxis({ audience: e.target.value as ShareAudience })}
          disabled={s.saving || loading}
          aria-label={`Who can open this ${noun}`}
          className={SELECT_CLASS}
        >
          {AUDIENCE_OPTIONS.map((a) => (
            <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>
          ))}
        </select>
      </AxisRow>

      {/* Level and gate describe link-holders, so a private resource doesn't
          show them at all: a disabled "Can view" next to "Only you and your
          team" just invites the question of who it applies to. */}
      {shared && axes && (
        <>
          {allowEdit && (
            <AxisRow label="Access level" icon={axes.level === "edit" ? Pencil : Eye} active>
              <select
                value={axes.level}
                onChange={(e) => s.saveAxis({ level: e.target.value as ShareLevel })}
                disabled={s.saving}
                aria-label="What link holders can do"
                className={SELECT_CLASS}
              >
                {LEVEL_OPTIONS.map((l) => (
                  <option key={l} value={l}>{LEVEL_LABEL[l]}</option>
                ))}
              </select>
            </AxisRow>
          )}

          <AxisRow label="Ask them for" icon={GateIcon} active={axes.gate !== "none"}>
            <select
              value={axes.gate}
              onChange={(e) => s.saveAxis({ gate: e.target.value as ShareGate })}
              disabled={s.saving}
              aria-label={`What visitors hand over before the ${noun} opens`}
              className={SELECT_CLASS}
            >
              {gateOptionsFor(axes.level).map((g) => (
                <option key={g} value={g}>{gateLabel[g]}</option>
              ))}
            </select>
          </AxisRow>
        </>
      )}

      {/* Lines up under the selects: 72px label + 8 gap + 16 icon + 8 gap. */}
      {axes?.gate === "password" && (
        <div className="mt-2 flex items-center gap-1.5 pl-[104px]">
          <input
            type="text"
            value={s.password}
            onChange={(e) => s.setPassword(e.target.value)}
            placeholder={s.hasPassword ? "Change password…" : "Set a password"}
            aria-label="Share password"
            className="min-w-0 flex-1 rounded-lg border border-share-line bg-share-field px-3 py-1.5 text-sm text-share-ink placeholder:text-share-faint outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => s.savePassword()}
            disabled={s.saving || (!s.password && !s.hasPassword)}
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-share-on-accent disabled:opacity-40"
          >
            Save
          </button>
        </div>
      )}

      {/* What the chosen combination means for a stranger with the link, in one
          sentence: the thing a fused select tried to encode in its option
          labels and couldn't. */}
      {axes && (
        <p className={`mt-2 px-0.5 text-[11px] leading-relaxed ${axes.level === "edit" ? "text-share-warn" : "text-share-muted"}`}>
          {consequenceOf(axes, noun, editLimits)}
        </p>
      )}

      {children && <div className="mt-2">{children}</div>}

      {s.error && <p className="text-xs text-share-danger mt-2" role="alert">{s.error}</p>}
    </div>
  );
}

const SELECT_CLASS =
  "min-w-0 flex-1 rounded-lg border border-share-line bg-share-field px-2 py-1.5 text-sm text-share-ink outline-none focus:border-accent disabled:opacity-40";

/** One labelled axis. The fixed-width label column is what separates the
 *  questions visually: without it, stacked selects read as a list of
 *  alternatives rather than independent settings. */
function AxisRow({
  label,
  icon: Icon,
  active,
  children,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <span className="w-[72px] shrink-0 text-right text-[11px] text-share-muted">{label}</span>
      <Icon className={`w-4 h-4 shrink-0 ${active ? "text-accent" : "text-share-muted"}`} />
      {children}
    </div>
  );
}
