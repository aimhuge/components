"use client";

// A sheet's floating menus (a column's filter, and any menu an app hangs off a cell): drawn in
// a portal at the corner of what opened them, since the sheet's cells clip whatever spills out, on the
// same frosted glass as the sheet. A click anywhere else, Escape, or a resize closes it.
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface SheetPopoverProps {
  anchor: DOMRect;
  width?: number;
  label: string;
  onClose: () => void;
  children: ReactNode;
}

export function SheetPopover({ anchor, width = 260, label, onClose, children }: SheetPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      style={{ top: anchor.bottom + 4, left, width }}
      className="sheet-pop fixed z-[60] flex flex-col overflow-hidden text-[12px] text-sheet-ink"
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

// The search box at the top of a menu: type-ahead, focused the moment the menu opens.
export function PopSearch({
  value,
  placeholder,
  onChange,
  onKeyDown,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="sheet-pop-search flex items-center gap-2 px-3 py-2">
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden className="shrink-0 text-sheet-faint">
        <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="m11 11 3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input
        autoFocus
        // The caret goes after what's there, so a search started by typing carries on from the first letter.
        onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-sheet-ink outline-none placeholder:text-sheet-faint"
      />
      {value && (
        <button aria-label="Clear the search" onClick={() => onChange("")} className="rounded px-1 text-sheet-faint hover:text-sheet-ink">
          ×
        </button>
      )}
    </label>
  );
}
