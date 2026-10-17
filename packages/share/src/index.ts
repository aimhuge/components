// Safe anywhere: no React, no Next, no crypto. The UI lives in
// `@aimhuge/share/client`, the gate pass and password hashing in
// `@aimhuge/share/server`.
export {
  type ShareMode,
  SHARE_MODES,
  isShareMode,
  linkGrantsRead,
  linkGrantsEdit,
  modeHasGate,
  MODE_BUTTON_LABEL,
} from "./modes.js";
export {
  type ShareAudience,
  type ShareLevel,
  type ShareGate,
  type ShareAxes,
  type ShareAccess,
  AUDIENCE_OPTIONS,
  AUDIENCE_LABEL,
  LEVEL_OPTIONS,
  LEVEL_LABEL,
  GATE_OPTIONS,
  gateLabels,
  gateOptionsFor,
  toAxes,
  toMode,
  withAxis,
  consequenceOf,
} from "./axes.js";
