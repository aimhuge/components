export declare function useDebouncedSearch(initial?: string, delay?: number): {
    searchTerm: string;
    setSearchTerm: (value: string) => void;
    debouncedSearchTerm: string;
};
