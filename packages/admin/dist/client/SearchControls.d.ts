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
export declare function SearchControls({ searchTerm, onSearchChange, placeholder, currentPage, totalPages, isLoading, extras, }: SearchControlsProps): import("react").JSX.Element;
