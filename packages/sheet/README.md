# @aimhuge/sheet

Any list of rows as a table that reads like a slightly futuristic Google Sheet: frosted glass, grid lines across and
down, a numbered gutter, a header that stays put. A click on a header opens a type-ahead filter (the search column
filters rows as you type, every other column narrows its values, with counts and Only), a number or date column flips
its sort on a click, and typing anywhere on the page starts the search. The sort, filters and search are kept in
localStorage per table. Extracted from Weft's board list view, which still builds its bands and card tree on top.

The package doesn't know what's in the rows. The app describes its columns, hands over every row (the sheet sorts
and filters in the browser), and draws any cell that needs more than its value.

## What the package owns, and what the app keeps

| Package | App |
|---|---|
| `SheetSpec` / `SheetColumn`: a table as columns (values, filter, number, rank, flip, sort names) and its search | Which columns, what a row holds in each, the search's wording ("Type a name or an email…") |
| `sortRows` / `sortItems`, `rowPasses`, `valueCountsOf`, `nextSortOf` / `flipSortOf`, `toggleHiddenOf`, `keepOnlyOf`, `filterCountOf`, `parseSheet` | Loading the rows (all of them), and any grouping on top (Weft's bands and card tree) |
| `timeBucket` / `TIME_ORDER`: Today, This week, This month, This year, Older | Which dates a column buckets |
| `matches` / `typeahead` / `stepHighlight`: every-word type-ahead, best match first | Other pickers that want the same matching |
| `sheetKey` / `useSheetKeys`: type to search, optional Space leaders, kept keys | The leaders and what they do, the keys left to the page, what counts as open over the sheet (`blocked`) |
| `<SheetTable>`: the whole flat sheet, with its empty, loading, error and no-match lines | Its cells (`cells`), column widths (`widths`), storage key, the fresh sort, what a row click opens |
| `<SheetHeader>`, `<SheetFilterMenu>`, `<SheetPopover>` / `<PopSearch>`, `useSheetState` | A sheet of its own built from the parts, and menus it hangs off cells |
| `sheet.css`: glass, grid, gutter, header, bands, menus, and the `sheet-*` colours, defaulting to a dark surface | Its palette (`--sheet-*` on `:root`) and the accent (`bg-accent`, `text-accent`) |

## Entry points

| Import | Holds |
|---|---|
| `@aimhuge/sheet` | Pure: specs, sort, filter, counts, saved-state parsing, date buckets, type-ahead, key rules. Safe anywhere. |
| `@aimhuge/sheet/client` | `"use client"` UI and hooks: `SheetTable`, `SheetHeader`, `SheetFilterMenu`, `SheetPopover`, `useSheetState`, `useSheetKeys`, `useNow`. |
| `@aimhuge/sheet/sheet.css` | The look, the `sheet-*` colours and Tailwind's `@source` for the package. |

## Install

```jsonc
// package.json
"@aimhuge/sheet": "github:aimhuge/components#vX.Y.Z&path:/packages/sheet"
```

Peers: `react` and `react-dom` 19. Tailwind 4 in the app (the components use its classes).

## Wiring an app

1. **The CSS**, once, in the global stylesheet after Tailwind, with the palette mapped to the app's own tokens:

   ```css
   @import "tailwindcss";
   @import "@aimhuge/sheet/sheet.css";

   :root {
     --sheet-ink: var(--ink);
     --sheet-muted: var(--muted);
     --sheet-faint: var(--faint);
     --sheet-line: var(--line);
     --sheet-line-strong: var(--line-strong);
     --sheet-panel: var(--panel);
     --sheet-sunken: var(--sunken);
     --sheet-danger: var(--danger);
     --sheet-accent: var(--accent);
     --sheet-accent-soft: var(--accent-soft);
   }
   ```

2. **The columns**, pure and tested, in the app:

   ```ts
   import { BLANK, TIME_ORDER, timeBucket, type SheetSpec } from "@aimhuge/sheet";

   export const USERS: SheetSpec<User, "user" | "provider" | "joined"> = {
     search: { key: "user", text: (u) => `${u.name} ${u.email}`, placeholder: "Type a name or an email…",
               hint: "Every word you type must be in the name or email", noun: ["account", "accounts"] },
     columns: [
       { key: "user", label: "User", values: (u) => [u.name ?? BLANK] },
       { key: "provider", label: "Provider", filter: true, values: (u) => [u.provider ?? BLANK] },
       { key: "joined", label: "Joined", filter: true, flip: true, sortNames: ["Newest first", "Oldest first"],
         values: (u, now) => [timeBucket(Date.parse(u.createdAt), now)],
         number: (u, now) => now - Date.parse(u.createdAt), rank: (v) => TIME_ORDER.indexOf(v) },
     ],
   };
   ```

3. **The table**, with every row:

   ```tsx
   import { SheetTable } from "@aimhuge/sheet/client";

   <SheetTable spec={USERS} rows={users} rowKey={(u) => u.id} storageKey="myapp:users"
     widths={["minmax(0, 2fr)", "minmax(0, 1fr)", "minmax(0, 1fr)"]}
     cells={{ user: (u) => <UserCell user={u} /> }} onRowClick={openUser} />
   ```

## Rules that are easy to break

- **Load every row.** Sorts, filters and counts run over what the sheet was given; a page of 20 filters 20.
- **Filters keep what's hidden, not what's shown**, so a value that turns up later shows by default. A saved sheet
  drops columns and bands it no longer knows.
- **Blanks sort last both ways** (`BLANK`, an empty values list, or a `number` of null), and a tie keeps the order the
  rows came in.
- **`widths` are grid tracks in column order.** Use `minmax(0, …fr)` so a long value truncates instead of widening the
  sheet; Tailwind drops arbitrary values with commas, which is why the widths are a prop and not a class.
- **One sheet listens for keys per page.** `useSheetKeys` takes printable keys in the capture phase unless the target
  is a field, a modifier is held, or `blocked()` says something is open (by default any `role="dialog"`).
- Vitest in the app must inline the package: `test.server.deps.inline: [/@aimhuge\//]`.

## Developing

```bash
pnpm --filter @aimhuge/sheet test
pnpm --filter @aimhuge/sheet typecheck
pnpm --filter @aimhuge/sheet build   # dist/ is committed: apps install from a tag
```
