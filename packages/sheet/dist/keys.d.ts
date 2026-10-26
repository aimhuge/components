export interface SheetKeyEvent {
    key: string;
    meta: boolean;
    ctrl: boolean;
    alt: boolean;
    typing: boolean;
    blocked: boolean;
}
export interface SheetKeyOptions<L extends string> {
    leaders?: Readonly<Record<string, L>>;
    kept?: readonly string[];
}
export type SheetKeyAction<L extends string> = {
    kind: "pass";
} | {
    kind: "leader";
} | {
    kind: "lead";
    to: L;
} | {
    kind: "search";
    text: string;
};
export declare const LEADER_MS = 1500;
export declare function sheetKey<L extends string>(e: SheetKeyEvent, leader: boolean, options?: SheetKeyOptions<L>): SheetKeyAction<L>;
