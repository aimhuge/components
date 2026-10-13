/**
 * `<SearchControls>` — the strip above the table: total count, current page
 * out of N, and the search input. Renders the `?` placeholder and the live
 * `searchTerm` value (the input is controlled by the page, not local state,
 * so the page can reset it programmatically).
 */
import { Search } from "lucide-react";

export interface SearchControlsProps {
  searchTerm: string;
  onSearchChange: (next: string) => void;
  placeholder?: string;
  currentPage: number;
  totalPages: number;
  isLoading?: boolean;
  /** Extra controls rendered to the right of the search input (e.g. a "show
   *  deleted" toggle). Apps pass `<Checkbox/>` and friends from their own
   *  design system here. */
  extras?: React.ReactNode;
}

export function SearchControls({
  searchTerm,
  onSearchChange,
  placeholder = "Search…",
  currentPage,
  totalPages,
  isLoading,
  extras,
}: SearchControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-admin-muted">
        Page {currentPage} of {totalPages}
        {isLoading ? " · loading…" : ""}
      </span>
      <div className="relative flex-1 min-w-[12rem] max-w-xs">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-admin-border bg-admin-surface py-1.5 pl-7 pr-2 text-sm text-admin-text placeholder:text-admin-muted focus:border-admin-accent focus:outline-none"
        />
      </div>
      {extras}
    </div>
  );
}
