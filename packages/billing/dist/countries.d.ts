/**
 * Countries selectable on a billing profile.
 *
 * A closed list in app code rather than a DB check constraint: the set changes
 * for commercial reasons (a new market opens, a sanctions list moves) and those
 * changes shouldn't need a migration. `org_billing_profiles.country` stores the
 * ISO 3166-1 alpha-2 code; this is the label lookup and the validator.
 *
 * Not exhaustive — the markets these apps actually invoice into, plus the ones
 * customers most often ask for. Adding one is a line here and nothing else.
 */
export interface Country {
    code: string;
    name: string;
}
export declare const COUNTRIES: readonly Country[];
export declare function isCountryCode(value: string | null | undefined): boolean;
export declare function countryName(code: string | null | undefined): string | null;
