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
export const COUNTRIES = [
    { code: "AU", name: "Australia" },
    { code: "AT", name: "Austria" },
    { code: "BE", name: "Belgium" },
    { code: "BR", name: "Brazil" },
    { code: "CA", name: "Canada" },
    { code: "DK", name: "Denmark" },
    { code: "FI", name: "Finland" },
    { code: "FR", name: "France" },
    { code: "DE", name: "Germany" },
    { code: "HK", name: "Hong Kong" },
    { code: "IN", name: "India" },
    { code: "IE", name: "Ireland" },
    { code: "IL", name: "Israel" },
    { code: "IT", name: "Italy" },
    { code: "JP", name: "Japan" },
    { code: "MY", name: "Malaysia" },
    { code: "MX", name: "Mexico" },
    { code: "NL", name: "Netherlands" },
    { code: "NZ", name: "New Zealand" },
    { code: "NO", name: "Norway" },
    { code: "PH", name: "Philippines" },
    { code: "PL", name: "Poland" },
    { code: "PT", name: "Portugal" },
    { code: "SG", name: "Singapore" },
    { code: "ZA", name: "South Africa" },
    { code: "KR", name: "South Korea" },
    { code: "ES", name: "Spain" },
    { code: "SE", name: "Sweden" },
    { code: "CH", name: "Switzerland" },
    { code: "TH", name: "Thailand" },
    { code: "AE", name: "United Arab Emirates" },
    { code: "GB", name: "United Kingdom" },
    { code: "US", name: "United States" },
];
const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
export function isCountryCode(value) {
    return !!value && BY_CODE.has(value.toUpperCase());
}
export function countryName(code) {
    if (!code)
        return null;
    return BY_CODE.get(code.toUpperCase())?.name ?? code;
}
