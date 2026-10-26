import { type SheetKeyOptions } from "../keys.js";
export interface SheetKeyHandlers<L extends string> extends SheetKeyOptions<L> {
    onSearch: (text: string) => void;
    onLead?: (to: L) => void;
    blocked?: () => boolean;
}
export declare function useSheetKeys<L extends string = never>(handlers: SheetKeyHandlers<L>): boolean;
