// Type-ahead matching for a sheet's menus: the header filters, and any picker an app builds beside them. Every word you
// type has to appear in the text; a match at the start ranks first, then one at a word's start, then
// one anywhere, and a shorter text wins a tie. Pure, so the menus only draw what this works out.

function words(query: string) {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

// How well the text matches: 0 is best, null is no match. An empty query matches everything at 0.
export function matchRank(text: string, query: string): number | null {
  const hay = text.toLowerCase();
  let rank = 0;
  for (const word of words(query)) {
    const at = hay.indexOf(word);
    if (at < 0) return null;
    rank += at === 0 ? 0 : /[\s/._\-(]/.test(hay.charAt(at - 1)) ? 1 : 2;
  }
  return rank;
}

export function matches(text: string, query: string) {
  return matchRank(text, query) !== null;
}

// The items that match, best first; with no query, all of them in their own order.
export function typeahead<T>(items: T[], query: string, text: (item: T) => string): T[] {
  if (!words(query).length) return items;
  return items
    .map((item, i) => ({ item, i, rank: matchRank(text(item), query), len: text(item).length }))
    .filter((r): r is { item: T; i: number; rank: number; len: number } => r.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.len - b.len || a.i - b.i)
    .map((r) => r.item);
}

// Moves a highlight through a list of n items with the arrow keys, wrapping at both ends.
export function stepHighlight(at: number, n: number, key: string): number {
  if (!n) return -1;
  if (key === "ArrowDown") return at < 0 ? 0 : (at + 1) % n;
  if (key === "ArrowUp") return at <= 0 ? n - 1 : at - 1;
  return at;
}
