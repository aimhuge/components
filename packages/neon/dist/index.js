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
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
export function ident(name) {
    const parts = name.split(".");
    if (!parts.every((p) => IDENT.test(p)))
        throw new Error(`@aimhuge/neon: unsafe identifier ${JSON.stringify(name)}`);
    return parts.map((p) => `"${p}"`).join(".");
}
function columns(cols) {
    const c = (cols ?? "*").trim();
    if (c === "*" || c === "")
        return "*";
    return c.split(",").map((x) => {
        const name = x.trim();
        if (name.includes("("))
            throw new Error(`@aimhuge/neon: embedded resources aren't supported (${name})`);
        return ident(name);
    }).join(", ");
}
const OPS = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" };
/** Rows from whatever the driver returned: neon gives an array, pg gives { rows }. */
function rowsOf(r) {
    if (Array.isArray(r))
        return r;
    if (r && typeof r === "object" && Array.isArray(r.rows))
        return r.rows;
    return [];
}
function toError(e) {
    const x = e;
    return { code: x?.code, message: x?.message ?? String(e), details: x?.detail ?? null, hint: x?.hint ?? null };
}
class Builder {
    db;
    table;
    op = "select";
    cols = "*";
    countMode = null;
    head = false;
    payload = [];
    patch = {};
    onConflict = [];
    ignoreDuplicates = false;
    where = [];
    params = [];
    orders = [];
    max = null;
    constructor(db, table) {
        this.db = db;
        this.table = table;
    }
    p(v) {
        this.params.push(v instanceof Date ? v.toISOString() : v);
        return `$${this.params.length}`;
    }
    select(cols, opts) {
        // After a write, select() only says "return the rows"; writes already do.
        if (this.op === "select") {
            this.cols = cols ?? "*";
            this.countMode = opts?.count ? "exact" : null;
            this.head = !!opts?.head;
        }
        return this;
    }
    insert(rows) { this.op = "insert"; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
    upsert(rows, opts) {
        this.op = "upsert";
        this.payload = Array.isArray(rows) ? rows : [rows];
        this.onConflict = (opts?.onConflict ?? "id").split(",").map((s) => s.trim());
        this.ignoreDuplicates = !!opts?.ignoreDuplicates;
        return this;
    }
    update(patch) { this.op = "update"; this.patch = patch; return this; }
    delete() { this.op = "delete"; return this; }
    cmp(col, op, v) { this.where.push(`${ident(col)} ${OPS[op]} ${this.p(v)}`); return this; }
    eq(c, v) { return this.cmp(c, "eq", v); }
    neq(c, v) { return this.cmp(c, "neq", v); }
    gt(c, v) { return this.cmp(c, "gt", v); }
    gte(c, v) { return this.cmp(c, "gte", v); }
    lt(c, v) { return this.cmp(c, "lt", v); }
    lte(c, v) { return this.cmp(c, "lte", v); }
    like(c, v) { return this.cmp(c, "like", v); }
    ilike(c, v) { return this.cmp(c, "ilike", v); }
    is(c, v) { this.where.push(this.isSql(c, v)); return this; }
    in(c, vs) { this.where.push(`${ident(c)} = any(${this.p(vs)})`); return this; }
    isSql(c, v) {
        const val = v === null || v === "null" ? "null" : v === true || v === "true" ? "true" : v === false || v === "false" ? "false" : null;
        if (!val)
            throw new Error(`@aimhuge/neon: is() takes null/true/false, got ${String(v)}`);
        return `${ident(c)} is ${val}`;
    }
    /** PostgREST's "(a,b,c)" list, values unquoted. */
    list(s) { return s.replace(/^\(|\)$/g, "").split(",").map((x) => x.trim()).filter(Boolean); }
    /** One `col.op.value` term from an or() string. */
    term(t) {
        const m = /^([A-Za-z_][A-Za-z0-9_]*)\.(not\.)?(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.(.*)$/.exec(t.trim());
        if (!m)
            throw new Error(`@aimhuge/neon: or() term not supported: ${t}`);
        const [, col, neg, op, raw] = m;
        let sql;
        if (op === "is")
            sql = this.isSql(col, raw);
        else if (op === "in")
            sql = `${ident(col)} = any(${this.p(this.list(raw))})`;
        else
            sql = `${ident(col)} ${OPS[op]} ${this.p(raw)}`;
        return neg ? `not (${sql})` : sql;
    }
    not(c, op, v) {
        if (op === "in")
            this.where.push(`not (${ident(c)} = any(${this.p(this.list(String(v)))}))`);
        else if (op === "is")
            this.where.push(`not (${this.isSql(c, v)})`);
        else if (OPS[op])
            this.where.push(`not (${ident(c)} ${OPS[op]} ${this.p(v)})`);
        else
            throw new Error(`@aimhuge/neon: not(${op}) not supported`);
        return this;
    }
    or(expr) {
        // Split on top-level commas only (in.(a,b) has its own).
        const terms = [];
        let depth = 0, cur = "";
        for (const ch of expr) {
            if (ch === "(")
                depth++;
            if (ch === ")")
                depth--;
            if (ch === "," && depth === 0) {
                terms.push(cur);
                cur = "";
            }
            else
                cur += ch;
        }
        if (cur)
            terms.push(cur);
        this.where.push(`(${terms.map((t) => this.term(t)).join(" or ")})`);
        return this;
    }
    order(c, opts) {
        const dir = opts?.ascending === false ? "desc" : "asc";
        const nulls = opts?.nullsFirst === undefined ? "" : opts.nullsFirst ? " nulls first" : " nulls last";
        this.orders.push(`${ident(c)} ${dir}${nulls}`);
        return this;
    }
    limit(n) { this.max = Math.max(0, Math.floor(n)); return this; }
    whereSql() { return this.where.length ? ` where ${this.where.join(" and ")}` : ""; }
    /** The SQL this builder runs, exposed for tests. */
    toSql() {
        const t = ident(this.table);
        if (this.op === "insert" || this.op === "upsert") {
            const keys = [...new Set(this.payload.flatMap((r) => Object.keys(r)))];
            if (!keys.length)
                throw new Error("@aimhuge/neon: nothing to insert");
            const values = this.payload.map((r) => `(${keys.map((k) => (k in r ? this.p(r[k] ?? null) : "default")).join(", ")})`).join(", ");
            let text = `insert into ${t} (${keys.map(ident).join(", ")}) values ${values}`;
            if (this.op === "upsert") {
                const target = this.onConflict.map(ident).join(", ");
                const set = keys.filter((k) => !this.onConflict.includes(k)).map((k) => `${ident(k)} = excluded.${ident(k)}`);
                text += this.ignoreDuplicates || !set.length
                    ? ` on conflict (${target}) do nothing`
                    : ` on conflict (${target}) do update set ${set.join(", ")}`;
            }
            return { text: `${text} returning *`, params: this.params };
        }
        if (this.op === "update") {
            const set = Object.entries(this.patch).map(([k, v]) => `${ident(k)} = ${this.p(v ?? null)}`);
            if (!set.length)
                throw new Error("@aimhuge/neon: empty update");
            return { text: `update ${t} set ${set.join(", ")}${this.whereSql()} returning *`, params: this.params };
        }
        if (this.op === "delete")
            return { text: `delete from ${t}${this.whereSql()} returning *`, params: this.params };
        const order = this.orders.length ? ` order by ${this.orders.join(", ")}` : "";
        const limit = this.max !== null ? ` limit ${this.max}` : "";
        return { text: `select ${columns(this.cols)} from ${t}${this.whereSql()}${order}${limit}`, params: this.params };
    }
    async run() {
        try {
            if (this.op === "select" && this.head) {
                const r = rowsOf(await this.db.query(`select count(*)::int as n from ${ident(this.table)}${this.whereSql()}`, this.params));
                return { data: null, error: null, count: Number(r[0]?.n ?? 0) };
            }
            const { text, params } = this.toSql();
            const rows = rowsOf(await this.db.query(text, params));
            return { data: rows, error: null, count: this.countMode ? rows.length : null };
        }
        catch (e) {
            return { data: null, error: toError(e), count: null };
        }
    }
    async maybeSingle() {
        const r = await this.run();
        if (r.error)
            return { data: null, error: r.error, count: null };
        if ((r.data?.length ?? 0) > 1)
            return { data: null, error: { code: "PGRST116", message: "more than one row" }, count: null };
        return { data: r.data?.[0] ?? null, error: null, count: null };
    }
    async single() {
        const r = await this.maybeSingle();
        if (!r.error && !r.data)
            return { data: null, error: { code: "PGRST116", message: "no rows" }, count: null };
        return r;
    }
    then(ok, fail) {
        return this.run().then(ok, fail);
    }
}
export function neonService(db) {
    return {
        from: (table) => new Builder(db, table),
        async rpc(fn, args = {}) {
            try {
                const entries = Object.entries(args);
                const named = entries.map(([k], i) => `${ident(k)} => $${i + 1}`).join(", ");
                const rows = rowsOf(await db.query(`select * from ${ident(fn)}(${named})`, entries.map(([, v]) => (v instanceof Date ? v.toISOString() : v))));
                const first = rows[0];
                const scalar = rows.length === 1 && first && Object.keys(first).length === 1;
                return { data: scalar ? Object.values(first)[0] : rows, error: null, count: null };
            }
            catch (e) {
                return { data: null, error: toError(e), count: null };
            }
        },
    };
}
/**
 * Hand a NeonService to a package typed against SupabaseClient. The cast is
 * the whole point of this package: it is shaped like the subset they call, not
 * like all of supabase-js, so TypeScript can't prove it structurally.
 */
export function asSupabase(service) {
    return service;
}
/**
 * Make a Supabase-targeted migration (e.g. `@aimhuge/billing/sql/0001_billing.sql`)
 * runnable on Neon: drops foreign keys into `auth.users` (Neon has no such
 * schema; the column stays) and grants to Supabase's `service_role`. RLS lines
 * are kept: on Neon the connection owns the tables, so they bypass RLS anyway.
 */
export function supabaseSqlForNeon(sql) {
    return sql
        .replace(/\s+references\s+auth\.users\s*\([^)]*\)(\s+on\s+delete\s+(cascade|set\s+null|restrict|no\s+action))?/gi, "")
        .replace(/^\s*grant\b[^;]*\bto\s+service_role\s*;\s*$/gim, "")
        .replace(/^\s*revoke\b[^;]*\bfrom\s+(anon|authenticated|public)\b[^;]*;\s*$/gim, "");
}
/**
 * Split a migration into statements for drivers that run one at a time
 * (neon's HTTP query). Keeps $$-quoted function bodies whole; drops comments.
 */
export function splitSql(sql) {
    const out = [];
    let cur = "";
    let inDollar = false;
    for (const line of sql.split("\n")) {
        const code = inDollar ? line : line.replace(/--.*$/, "");
        if ((code.match(/\$\$/g) ?? []).length % 2 === 1)
            inDollar = !inDollar;
        cur += code + "\n";
        if (!inDollar && /;\s*$/.test(code)) {
            if (cur.trim() !== ";")
                out.push(cur.trim().replace(/;$/, ""));
            cur = "";
        }
    }
    if (cur.trim())
        out.push(cur.trim());
    return out.filter(Boolean);
}
