/**
 * A Supabase-shaped service client over Neon (or any Postgres reachable with a
 * `query(text, params)` function): the query-builder subset the @aimhuge
 * packages call, compiled to parameterised SQL.
 *
 *   const service = neonService(neon(process.env.DATABASE_URL!))
 *   await billing.subscription(asSupabase(service), orgId)
 *
 * Covered: from(t).select(cols, {count, head}) / insert / upsert({onConflict})
 * / update / delete, filters eq neq gt gte lt lte like ilike is in
 * not(col, op, value) or("a.is.null,a.gt.x"), order, limit, single,
 * maybeSingle, awaiting the builder, and rpc(fn, namedArgs). Results are
 * `{ data, error, count }` like PostgREST, and errors keep Postgres' `code`
 * (so `23505` duplicate checks still work). Writes return their rows.
 *
 * It is NOT PostgREST: no embedded resources ("a, b(c)"), no RLS (it runs as
 * whoever the connection string is), no JSON-path columns. Anything off the
 * list throws, by name, rather than guessing.
 */
/** The one thing we need from a driver. `neon(url)` satisfies it, as does a pg Pool. */
export interface Queryable {
    query(text: string, params?: unknown[]): Promise<unknown>;
}
export type PgError = {
    code?: string;
    message: string;
    details?: string | null;
    hint?: string | null;
};
export type Result<T = Row[]> = {
    data: T | null;
    error: PgError | null;
    count: number | null;
};
type Row = Record<string, unknown>;
export declare function ident(name: string): string;
declare class Builder implements PromiseLike<Result> {
    private db;
    private table;
    private op;
    private cols;
    private countMode;
    private head;
    private payload;
    private patch;
    private onConflict;
    private ignoreDuplicates;
    private where;
    private params;
    private orders;
    private max;
    constructor(db: Queryable, table: string);
    private p;
    select(cols?: string, opts?: {
        count?: "exact" | "planned" | "estimated";
        head?: boolean;
    }): this;
    insert(rows: Row | Row[]): this;
    upsert(rows: Row | Row[], opts?: {
        onConflict?: string;
        ignoreDuplicates?: boolean;
    }): this;
    update(patch: Row): this;
    delete(): this;
    private cmp;
    eq(c: string, v: unknown): this;
    neq(c: string, v: unknown): this;
    gt(c: string, v: unknown): this;
    gte(c: string, v: unknown): this;
    lt(c: string, v: unknown): this;
    lte(c: string, v: unknown): this;
    like(c: string, v: string): this;
    ilike(c: string, v: string): this;
    is(c: string, v: null | boolean): this;
    in(c: string, vs: unknown[]): this;
    private isSql;
    /** PostgREST's "(a,b,c)" list, values unquoted. */
    private list;
    /** One `col.op.value` term from an or() string. */
    private term;
    not(c: string, op: string, v: unknown): this;
    or(expr: string): this;
    order(c: string, opts?: {
        ascending?: boolean;
        nullsFirst?: boolean;
    }): this;
    limit(n: number): this;
    private whereSql;
    /** The SQL this builder runs, exposed for tests. */
    toSql(): {
        text: string;
        params: unknown[];
    };
    private run;
    maybeSingle(): Promise<Result<Row>>;
    single(): Promise<Result<Row>>;
    then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null): Promise<A | B>;
}
export interface NeonService {
    from(table: string): Builder;
    /** Calls a function with named args. A scalar function's value comes back as `data` itself, like PostgREST. */
    rpc(fn: string, args?: Record<string, unknown>): Promise<Result<unknown>>;
}
export declare function neonService(db: Queryable): NeonService;
/**
 * Hand a NeonService to a package typed against SupabaseClient. The cast is
 * the whole point of this package: it is shaped like the subset they call, not
 * like all of supabase-js, so TypeScript can't prove it structurally.
 */
export declare function asSupabase<T>(service: NeonService): T;
/**
 * Make a Supabase-targeted migration (e.g. `@aimhuge/billing/sql/0001_billing.sql`)
 * runnable on Neon: drops foreign keys into `auth.users` (Neon has no such
 * schema; the column stays) and grants to Supabase's `service_role`. RLS lines
 * are kept: on Neon the connection owns the tables, so they bypass RLS anyway.
 */
export declare function supabaseSqlForNeon(sql: string): string;
/**
 * Split a migration into statements for drivers that run one at a time
 * (neon's HTTP query). Keeps $$-quoted function bodies whole; drops comments.
 */
export declare function splitSql(sql: string): string[];
export {};
