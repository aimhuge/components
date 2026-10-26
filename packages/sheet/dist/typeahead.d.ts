export declare function matchRank(text: string, query: string): number | null;
export declare function matches(text: string, query: string): boolean;
export declare function typeahead<T>(items: T[], query: string, text: (item: T) => string): T[];
export declare function stepHighlight(at: number, n: number, key: string): number;
