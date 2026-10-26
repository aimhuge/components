import { type SheetSpec, type SheetStateOf } from "../sheet.js";
export interface SheetActions<K extends string = string> {
    setSort: (key: K, dir: "asc" | "desc" | null) => void;
    flip: (key: K) => void;
    toggle: (key: K, value: string) => void;
    only: (key: K, all: string[], keep: string[]) => void;
    hideAll: (key: K, all: string[]) => void;
    setQuery: (query: string) => void;
}
export type HeaderMenu = {
    key: string;
    anchor: DOMRect;
} | null;
export interface SheetHeaderProps<T, K extends string> {
    spec: SheetSpec<T, K>;
    grid: string;
    state: SheetStateOf<K>;
    rows: T[];
    shown: number;
    now: number;
    actions: SheetActions<K>;
    menu: HeaderMenu;
    setMenu: (menu: HeaderMenu) => void;
    trailing?: number;
}
export declare function SheetHeader<T, K extends string>(props: SheetHeaderProps<T, K>): import("react").JSX.Element;
