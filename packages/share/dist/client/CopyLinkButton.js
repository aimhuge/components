"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { Check, Link2 } from "lucide-react";
const FLASH_MS = 1500;
/** Copies a share link and flashes "Copied". Each button keeps its own flash,
 *  so copying the edit link never lights up the view link's button.
 *
 *  size "sm" is the dialog header's chip, "md" the footer button; tone "accent"
 *  marks the one link that grants more than reading. */
export function CopyLinkButton({ url, label = "Copy link", copiedLabel = "Copied", icon: Icon = Link2, size = "md", tone = "plain", title, onCopied, }) {
    const [copied, setCopied] = useState(false);
    const timer = useRef(null);
    useEffect(() => () => {
        if (timer.current)
            clearTimeout(timer.current);
    }, []);
    async function copy() {
        try {
            await navigator.clipboard.writeText(typeof url === "function" ? url() : url);
            setCopied(true);
            onCopied?.();
            if (timer.current)
                clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), FLASH_MS);
        }
        catch {
            /* clipboard unavailable: the link is on screen anyway */
        }
    }
    const sm = size === "sm";
    const shape = sm
        ? "gap-1 rounded-md px-2 py-1 text-xs"
        : "gap-1.5 rounded-lg px-3 py-1.5 text-sm";
    const colour = tone === "accent"
        ? "border-accent/50 bg-accent/10 text-share-ink hover:bg-accent/20"
        : "border-share-line-strong text-share-soft hover:border-accent hover:text-share-ink";
    const glyph = sm ? "w-3.5 h-3.5" : "w-4 h-4";
    return (_jsxs("button", { type: "button", onClick: copy, title: title ?? label, className: `flex shrink-0 items-center border ${shape} ${colour}`, children: [copied ? _jsx(Check, { className: `${glyph} text-share-ok` }) : _jsx(Icon, { className: glyph }), copied ? copiedLabel : label] }));
}
