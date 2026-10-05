/**
 * An in-memory stand-in for the service-role Supabase client — just the
 * query-builder surface the billing server code uses, over plain arrays.
 * Not a Postgres: it enforces only the uniqueness the code relies on
 * (`billing_webhook_events.id`, `org_subscriptions.org_id`).
 */
import type { Service } from "../server/runtime.js";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

const UNIQUE: Record<string, string[]> = {
  billing_webhook_events: ["id"],
  org_subscriptions: ["org_id"],
};

export interface FakeDb {
  tables: Record<string, Row[]>;
  service: Service;
  calls: string[];
}

export function fakeSupabase(seed: Record<string, Row[]> = {}): FakeDb {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ ...r }));
  const calls: string[] = [];
  const table = (name: string) => (tables[name] ??= []);

  function builder(name: string) {
    const filters: Filter[] = [];
    let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    let conflict: string[] = [];
    let head = false;
    let order: { col: string; asc: boolean }[] = [];
    let limit = Infinity;

    const run = () => {
      const rows = table(name);
      if (op === "insert" || op === "upsert") {
        const incoming = (Array.isArray(payload) ? payload : [payload!]).map((r) => ({ ...r }));
        const out: Row[] = [];
        for (const row of incoming) {
          const keys = op === "upsert" ? conflict : (UNIQUE[name] ?? []);
          const existing = keys.length ? rows.find((r) => keys.every((k) => r[k] === row[k])) : undefined;
          if (existing && op === "insert") {
            return { data: null, error: { code: "23505", message: `duplicate key in ${name}` }, count: null };
          }
          if (existing) {
            Object.assign(existing, row);
            out.push(existing);
          } else {
            const created = { id: row.id ?? `${name}-${rows.length + 1}`, created_at: new Date().toISOString(), ...row };
            rows.push(created);
            out.push(created);
          }
        }
        return { data: out, error: null, count: null };
      }
      let matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        for (const r of matched) Object.assign(r, payload);
        return { data: matched, error: null, count: null };
      }
      if (op === "delete") {
        tables[name] = rows.filter((r) => !matched.includes(r));
        return { data: matched, error: null, count: null };
      }
      for (const { col, asc } of [...order].reverse()) {
        matched = [...matched].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      const count = matched.length;
      return { data: head ? null : matched.slice(0, limit), error: null, count };
    };

    const one = (strict: boolean) => {
      const result = run();
      const rows = (result.data ?? []) as Row[];
      if (result.error) return { data: null, error: result.error };
      if (rows.length === 0) return strict ? { data: null, error: { message: "no rows" } } : { data: null, error: null };
      return { data: rows[0], error: null };
    };

    const q = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        head = !!opts?.head;
        return q;
      },
      insert(row: Row | Row[]) {
        calls.push(`insert ${name}`);
        op = "insert";
        payload = row;
        return q;
      },
      update(patch: Row) {
        calls.push(`update ${name}`);
        op = "update";
        payload = patch;
        return q;
      },
      upsert(row: Row | Row[], opts: { onConflict: string }) {
        calls.push(`upsert ${name}`);
        op = "upsert";
        payload = row;
        conflict = opts.onConflict.split(",");
        return q;
      },
      delete() {
        calls.push(`delete ${name}`);
        op = "delete";
        return q;
      },
      eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), q),
      is: (col: string, v: unknown) => (filters.push((r) => (r[col] ?? null) === v), q),
      gte: (col: string, v: string) => (filters.push((r) => String(r[col]) >= v), q),
      lt: (col: string, v: string) => (filters.push((r) => String(r[col]) < v), q),
      like: (col: string, pattern: string) => {
        const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`);
        filters.push((r) => re.test(String(r[col])));
        return q;
      },
      not: (col: string, _op: "in", list: string) => {
        const values = list.replace(/^\(|\)$/g, "").split(",");
        filters.push((r) => !values.includes(String(r[col])));
        return q;
      },
      // Only the one shape the ledger uses: `x.is.null,x.gt.<iso>`.
      or: (expr: string) => {
        const [, col, iso] = /^(\w+)\.is\.null,\w+\.gt\.(.+)$/.exec(expr) ?? [];
        filters.push((r) => r[col!] == null || String(r[col!]) > iso!);
        return q;
      },
      order: (col: string, opts?: { ascending?: boolean }) => (order.push({ col, asc: opts?.ascending ?? true }), q),
      limit: (n: number) => ((limit = n), q),
      maybeSingle: async () => one(false),
      single: async () => one(true),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return q;
  }

  const service = {
    from: (name: string) => builder(name),
    rpc: async (fn: string, args: { p_org_id: string; p_meter: string; p_since: string | null }) => {
      calls.push(`rpc ${fn}`);
      if (fn !== "org_usage_total") return { data: null, error: { message: `no rpc ${fn}` } };
      const total = table("org_usage_charges")
        .filter((r) => r.org_id === args.p_org_id && r.meter === args.p_meter)
        .filter((r) => args.p_since === null || String(r.created_at) >= args.p_since)
        .reduce((sum, r) => sum + Number(r.amount), 0);
      return { data: total, error: null };
    },
  } as unknown as Service;

  return { tables, service, calls };
}
