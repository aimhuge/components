import { EyeOff, Globe, Lock, Mail, Pencil, Unlock, type LucideIcon } from "lucide-react";
import type { ShareAudience, ShareGate } from "../axes.js";
import type { ShareMode } from "../modes.js";

/** Per-axis glyphs for the general-access rows. The gate icon is the one that
 *  carries real information at a glance: an open padlock means a stranger walks
 *  straight in. */
export const AUDIENCE_ICON: Record<ShareAudience, LucideIcon> = {
  private: EyeOff,
  link: Globe,
};

export const GATE_ICON: Record<ShareGate, LucideIcon> = {
  none: Unlock,
  email: Mail,
  password: Lock,
};

/** The Share button's glyph for each stored mode. */
export const MODE_ICON: Record<ShareMode, LucideIcon> = {
  private: EyeOff,
  public: Globe,
  email: Mail,
  password: Lock,
  public_edit: Pencil,
};
