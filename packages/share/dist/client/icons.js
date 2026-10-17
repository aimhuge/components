import { EyeOff, Globe, Lock, Mail, Pencil, Unlock } from "lucide-react";
/** Per-axis glyphs for the general-access rows. The gate icon is the one that
 *  carries real information at a glance: an open padlock means a stranger walks
 *  straight in. */
export const AUDIENCE_ICON = {
    private: EyeOff,
    link: Globe,
};
export const GATE_ICON = {
    none: Unlock,
    email: Mail,
    password: Lock,
};
/** The Share button's glyph for each stored mode. */
export const MODE_ICON = {
    private: EyeOff,
    public: Globe,
    email: Mail,
    password: Lock,
    public_edit: Pencil,
};
