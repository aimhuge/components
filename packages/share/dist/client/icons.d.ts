import { type LucideIcon } from "lucide-react";
import type { ShareAudience, ShareGate } from "../axes.js";
import type { ShareMode } from "../modes.js";
/** Per-axis glyphs for the general-access rows. The gate icon is the one that
 *  carries real information at a glance: an open padlock means a stranger walks
 *  straight in. */
export declare const AUDIENCE_ICON: Record<ShareAudience, LucideIcon>;
export declare const GATE_ICON: Record<ShareGate, LucideIcon>;
/** The Share button's glyph for each stored mode. */
export declare const MODE_ICON: Record<ShareMode, LucideIcon>;
