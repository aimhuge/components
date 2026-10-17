// Safe anywhere: no React, no Next, no crypto. The UI lives in
// `@aimhuge/share/client`, the gate pass and password hashing in
// `@aimhuge/share/server`.
export { SHARE_MODES, isShareMode, linkGrantsRead, linkGrantsEdit, modeHasGate, MODE_BUTTON_LABEL, } from "./modes.js";
export { AUDIENCE_OPTIONS, AUDIENCE_LABEL, LEVEL_OPTIONS, LEVEL_LABEL, GATE_OPTIONS, gateLabels, gateOptionsFor, toAxes, toMode, withAxis, consequenceOf, } from "./axes.js";
