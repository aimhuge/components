import { type ShareAccess, type ShareAxes } from "../axes.js";
import type { ShareMode } from "../modes.js";
/** What the app's server says the resource is shared as. */
export type ShareAccessSnapshot = {
    shareMode: ShareMode;
    editRequiresEmail: boolean;
    hasPassword: boolean;
};
/** The app's write. Return `{ ok: false, error }` for a refusal the server
 *  explained; throw for a network failure. */
export type SaveShareAccess = (access: ShareAccess, password: string | undefined) => Promise<{
    ok: boolean;
    error?: string;
}>;
export type UseShareAccessOptions = {
    save: SaveShareAccess;
    /** After a change has been saved, e.g. for analytics. */
    onSaved?: (mode: ShareMode) => void;
};
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
export declare function useShareAccess({ save, onSaved }: UseShareAccessOptions): {
    mode: ShareMode | null;
    axes: ShareAxes | null;
    editRequiresEmail: boolean;
    hasPassword: boolean;
    password: string;
    setPassword: import("react").Dispatch<import("react").SetStateAction<string>>;
    saving: boolean;
    saved: boolean;
    error: string | null;
    hydrate: (s: ShareAccessSnapshot) => void;
    saveAxis: (patch: Partial<ShareAxes>) => Promise<void>;
    savePassword: () => Promise<void>;
};
export type ShareAccessState = ReturnType<typeof useShareAccess>;
