import { type ReactNode } from "react";
export interface SheetPopoverProps {
    anchor: DOMRect;
    width?: number;
    label: string;
    onClose: () => void;
    children: ReactNode;
}
export declare function SheetPopover({ anchor, width, label, onClose, children }: SheetPopoverProps): import("react").ReactPortal;
export declare function PopSearch({ value, placeholder, onChange, onKeyDown, }: {
    value: string;
    placeholder: string;
    onChange: (value: string) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}): import("react").JSX.Element;
