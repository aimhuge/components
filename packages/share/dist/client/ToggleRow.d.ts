import type { ComponentType } from "react";
/** On/off row for a share setting. Keeps its sub-caption: a bare "Allow
 *  anonymous posts / Off" makes the reader guess what Off actually does. */
export declare function ToggleRow({ icon: RowIcon, label, sub, on, disabled, busy, indent, onClick, }: {
    icon?: ComponentType<{
        className?: string;
    }>;
    label: string;
    sub?: string;
    on: boolean;
    disabled?: boolean;
    busy?: boolean;
    indent?: boolean;
    onClick: () => void;
}): import("react").JSX.Element;
