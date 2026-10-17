import { type ReactNode } from "react";
/** The Share dialog's frame, Google-Docs style: a title with a quick Copy link
 *  beside it, the app's sections in the middle (people, general access, a link
 *  preview), and a footer with the link buttons and Done.
 *
 *  Mount it only while open. Escape, the backdrop and the X all call onClose,
 *  once each, so the app's close (which may save on the way out) runs once. */
export declare function ShareDialog({ title, onClose, headerAction, footerStart, doneLabel, children, }: {
    /** The whole heading, e.g. `Share “Q3 plan”`. Also the dialog's aria-label. */
    title: string;
    onClose: () => void;
    /** Beside the title, usually a small `<CopyLinkButton size="sm">`. */
    headerAction?: ReactNode;
    /** Left side of the footer, usually the copy buttons. */
    footerStart?: ReactNode;
    doneLabel?: string;
    children: ReactNode;
}): import("react").JSX.Element;
