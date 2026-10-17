import { type ComponentType } from "react";
/** Copies a share link and flashes "Copied". Each button keeps its own flash,
 *  so copying the edit link never lights up the view link's button.
 *
 *  size "sm" is the dialog header's chip, "md" the footer button; tone "accent"
 *  marks the one link that grants more than reading. */
export declare function CopyLinkButton({ url, label, copiedLabel, icon: Icon, size, tone, title, onCopied, }: {
    url: string | (() => string);
    label?: string;
    copiedLabel?: string;
    icon?: ComponentType<{
        className?: string;
    }>;
    size?: "sm" | "md";
    tone?: "plain" | "accent";
    title?: string;
    onCopied?: () => void;
}): import("react").JSX.Element;
