/**
 * A small in-memory stand-in for the supabase-js query builder: select /
 * insert / update / upsert / delete with the filters this package's queries
 * use. Copied from BlastCP's publishing test fake (itself from DeckCP).
 *
 * Asserting on the rows a call leaves behind (rather than on how it was
 * called) is the point: a claim that filtered on the wrong column would still
 * satisfy a `toHaveBeenCalledWith` assertion.
 */
type Row = Record<string, unknown>;

interface Filter {
  col: string;
  val: unknown;
  op: "eq" | "neq" | "is" | "not-is" | "lt" | "lte" | "gt" | "in";
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const v = row[f.col];
    switch (f.op) {
      case "is":
        // `.is(col, null)` must match a column an insert never set — Postgres
        // (and this fake) treat absent and NULL the same.
        return f.val === null ? v === null || v === undefined : v === f.val;
      case "neq":
        return v !== f.val;
      case "not-is":
        // `.not(col, "is", null)` — the column has a value.
        return f.val === null ? v !== null && v !== undefined : v !== f.val;
      case "lt":
        return String(v) < String(f.val);
      case "gt":
        return String(v) > String(f.val);
      case "lte":
        return String(v) <= String(f.val);
      case "in":
        return Array.isArray(f.val) && f.val.includes(v);
      default:
        return v === f.val;
    }
  });
}

type Mode = "select" | "insert" | "update" | "upsert" | "delete";

class Builder implements PromiseLike<{ data: Row[] | null; error: unknown }> {
  private filters: Filter[] = [];
  private mode: Mode = "select";
  private payload: Row | Row[] | null = null;
  private conflictCols: string[] = [];
  private mergeOnConflict = false;
  private limitN: number | null = null;
  private orderCol: string | null = null;
  private orderAsc = true;

  constructor(
    private readonly store: Record<string, Row[]>,
    private readonly table: string,
  ) {}

  private get rows(): Row[] {
    return (this.store[this.table] ??= []);
  }

  select() {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, val, op: "eq" });
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push({ col, val, op: "is" });
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push({ col, val, op: "neq" });
    return this;
  }
  gt(col: string, val: unknown) {
    this.filters.push({ col, val, op: "gt" });
    return this;
  }
  /** Only the `.not(col, "is", null)` shape the publishing reads use. */
  not(col: string, op: string, val: unknown) {
    if (op !== "is") throw new Error(`fake-supabase: .not(_, "${op}", _) isn't modeled`);
    this.filters.push({ col, val, op: "not-is" });
    return this;
  }
  lt(col: string, val: unknown) {
    this.filters.push({ col, val, op: "lt" });
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push({ col, val, op: "lte" });
    return this;
  }
  in(col: string, val: unknown[]) {
    this.filters.push({ col, val, op: "in" });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }

  insert(payload: Row | Row[]) {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }
  /** Only the importer's shape: ignoreDuplicates on a composite conflict
   *  target, i.e. Postgres `on conflict (cols) do nothing`. A row whose
   *  conflict columns already match an existing one is dropped and, like
   *  PostgREST, is absent from the returned rows. */
  upsert(payload: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    // Without ignoreDuplicates it is Postgres `on conflict do update`: the
    // incoming columns overwrite the existing row's (YouTube reach rows).
    this.mergeOnConflict = !opts?.ignoreDuplicates;
    this.mode = "upsert";
    this.payload = payload;
    this.conflictCols = (opts?.onConflict ?? "").split(",").map((c) => c.trim()).filter(Boolean);
    return this;
  }
  update(payload: Row) {
    this.mode = "update";
    this.payload = payload;
    return this;
  }
  /** `.delete().in(...).select("id")` — the erasure path. Returns the rows it
   *  removed, as PostgREST does when the call carries a `select`. */
  delete() {
    this.mode = "delete";
    return this;
  }

  async maybeSingle() {
    const { data, error } = await this.run();
    return { data: data?.[0] ?? null, error };
  }
  async single() {
    const { data, error } = await this.run();
    return { data: data?.[0] ?? null, error: data?.length ? error : (error ?? { message: "no rows" }) };
  }

  then<R1 = { data: Row[] | null; error: unknown }, R2 = never>(
    onfulfilled?: ((v: { data: Row[] | null; error: unknown }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run(): Promise<{ data: Row[] | null; error: unknown }> {
    switch (this.mode) {
      case "insert": {
        const rows = (Array.isArray(this.payload) ? this.payload : [this.payload ?? {}]).map((r) => ({ ...r }));
        // Postgres defaults a post's id; model that one, so a test can create
        // a post and then act on it (`posts/cross-post.ts`).
        if (this.table === "posts") for (const r of rows) r.id ??= `post-${this.rows.length + rows.indexOf(r) + 1}`;
        // …and `trg_posts_wrap_in_blast` puts a post nobody put in a blast in one of its own.
        if (this.table === "posts") for (const r of rows) r.blast_id ??= `blast-${r.id as string}`;
        // The Pipeline's tables default their ids too (`blasts-1`, `tags-2`, …).
        if (this.table === "blasts" || this.table === "tags") {
          for (const r of rows) r.id ??= `${this.table}-${this.rows.length + rows.indexOf(r) + 1}`;
        }
        this.rows.push(...rows);
        return { data: rows, error: null };
      }
      case "upsert": {
        const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload ?? {}]).map((r) => ({ ...r }));
        const key = (r: Row) => this.conflictCols.map((c) => String(r[c])).join("\u0000");
        const taken = new Set(this.rows.map(key));
        const written: Row[] = [];
        for (const row of incoming) {
          if (this.mergeOnConflict) {
            const existing = this.rows.find((r) => key(r) === key(row));
            if (existing) {
              Object.assign(existing, row);
              written.push(existing);
              continue;
            }
          }
          if (taken.has(key(row))) continue;
          taken.add(key(row));
          this.rows.push(row);
          written.push(row);
        }
        return { data: written, error: null };
      }
      case "update": {
        const hits = this.rows.filter((r) => matches(r, this.filters));
        for (const r of hits) Object.assign(r, this.payload ?? {});
        return { data: hits, error: null };
      }
      case "delete": {
        const hits = this.rows.filter((r) => matches(r, this.filters));
        const keep = this.rows.filter((r) => !matches(r, this.filters));
        this.rows.length = 0;
        this.rows.push(...keep);
        return { data: hits, error: null };
      }
      default: {
        let hits = this.rows.filter((r) => matches(r, this.filters));
        if (this.orderCol) {
          const col = this.orderCol;
          const dir = this.orderAsc ? 1 : -1;
          hits = [...hits].sort((a, b) => {
            const av = String(a[col] ?? "");
            const bv = String(b[col] ?? "");
            return av < bv ? -dir : av > bv ? dir : 0;
          });
        }
        if (this.limitN !== null) hits = hits.slice(0, this.limitN);
        return { data: hits, error: null };
      }
    }
  }
}

export interface FakeSupabase {
  from(table: string): Builder;
  /** No RPC is modeled: none of this package's code calls one. Any call is a
   *  thrown "not modeled", the same policy as the rest of this fake.
   *  calls. Any other function name is a thrown "not modeled", same policy
   *  as the rest of this fake. */
  rpc(fn: string, args: Row): Promise<{ data: Row | null; error: { message: string } | null }>;
  /** The backing store, for assertions and seeding. */
  tables: Record<string, Row[]>;
}

export function fakeSupabase(seed: Record<string, Row[]> = {}): FakeSupabase {
  const tables: Record<string, Row[]> = {};
  for (const [table, rows] of Object.entries(seed)) tables[table] = rows.map((r) => ({ ...r }));
  return {
    tables,
    from: (table: string) => new Builder(tables, table),
    rpc: async (fn: string, args: Row) => {
      void args;
      throw new Error(`fake-supabase: .rpc("${fn}") isn't modeled`);
    },
  };
}
