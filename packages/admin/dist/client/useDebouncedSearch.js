/**
 * `useDebouncedSearch` — pairs a `searchTerm` (the input value, instant) with
 * a `debouncedSearchTerm` (the value the page actually queries with, after
 * `delay` ms of stillness). Mirrors the hook fastmonitor uses; lives in the
 * package so we don't ask apps to copy a 20-line hook.
 */
import { useEffect, useState } from "react";
export function useDebouncedSearch(initial = "", delay = 300) {
    const [searchTerm, setSearchTerm] = useState(initial);
    const [debouncedSearchTerm, setDebounced] = useState(initial);
    useEffect(() => {
        const handle = window.setTimeout(() => setDebounced(searchTerm), delay);
        return () => window.clearTimeout(handle);
    }, [searchTerm, delay]);
    return { searchTerm, setSearchTerm, debouncedSearchTerm };
}
