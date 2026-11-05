import { describe, expect, it } from "vitest";
import { neonService, ident, splitSql, supabaseSqlForNeon, type Queryable } from "./index.js";
import { readFileSync } from "node:fs";

function recorder(reply: unknown = [], fail?: unknown) {
  const calls: { text: string; params?: unknown[] }[] = [];
  const db: Queryable = {
    async query(text, params) {
      calls.push({ text, params });
      if (fail) throw fail;
      return typeof reply === "function" ? (reply as (t: string) => unknown)(text) : reply;
    },
  };
  return { db, calls, s: neonService(db) };
}

describe("select", () => {
  it("compiles filters, order and limit to parameterised SQL", async () => {
    const { s, calls } = recorder([{ id: 1 }]);
    const r = await s.from("org_invoices").select("id, number").eq("org_id", "o1").gte("n", 3)
      .order("issued_at", { ascending: false }).limit(5);
    expect(calls[0]).toEqual({
      text: 'select "id", "number" from "org_invoices" where "org_id" = $1 and "n" >= $2 order by "issued_at" desc limit 5',
      params: ["o1", 3],
    });
    expect(r).toEqual({ data: [{ id: 1 }], error: null, count: null });
  });

  it("count + head runs a count and returns no rows", async () => {
    const { s, calls } = recorder([{ n: 4 }]);
    const r = await s.from("org_memberships").select("user_id", { count: "exact", head: true }).eq("org_id", "o1");
    expect(calls[0]!.text).toBe('select count(*)::int as n from "org_memberships" where "org_id" = $1');
    expect(r).toEqual({ data: null, error: null, count: 4 });
  });

  it("maybeSingle gives null on no rows, single gives an error", async () => {
    const { s } = recorder([]);
    expect((await s.from("orgs").select().eq("id", "x").maybeSingle()).data).toBeNull();
    expect((await s.from("orgs").select().eq("id", "x").single()).error?.code).toBe("PGRST116");
  });

  it("or() handles the ledger's is.null / gt pair", async () => {
    const { s, calls } = recorder([]);
    await s.from("org_credit_grants").select("amount, expires_at").eq("org_id", "o")
      .or("expires_at.is.null,expires_at.gt.2026-11-05T00:00:00.000Z");
    expect(calls[0]!.text).toBe(
      'select "amount", "expires_at" from "org_credit_grants" where "org_id" = $1 and ("expires_at" is null or "expires_at" > $2)');
    expect(calls[0]!.params).toEqual(["o", "2026-11-05T00:00:00.000Z"]);
  });

  it("not(col, 'in', '(a,b)') becomes a negated any()", async () => {
    const { s, calls } = recorder([]);
    await s.from("org_payment_methods").delete().eq("org_id", "o").not("provider_payment_method_id", "in", "(pm_1,pm_2)");
    expect(calls[0]).toEqual({
      text: 'delete from "org_payment_methods" where "org_id" = $1 and not ("provider_payment_method_id" = any($2)) returning *',
      params: ["o", ["pm_1", "pm_2"]],
    });
  });

  it("refuses embedded resources and unsafe identifiers", () => {
    const { s } = recorder();
    expect(() => s.from("orgs").select("id, members(email)").toSql()).toThrow(/embedded/);
    expect(() => ident('x"; drop table orgs; --')).toThrow(/unsafe/);
  });
});

describe("writes", () => {
  it("upsert targets onConflict and updates the rest", async () => {
    const { s, calls } = recorder([{ org_id: "o", plan: "pro" }]);
    const r = await s.from("org_subscriptions").upsert({ org_id: "o", plan: "pro" }, { onConflict: "org_id" }).select().single();
    expect(calls[0]!.text).toBe(
      'insert into "org_subscriptions" ("org_id", "plan") values ($1, $2) on conflict ("org_id") do update set "plan" = excluded."plan" returning *');
    expect(r.data).toEqual({ org_id: "o", plan: "pro" });
  });

  it("multi-row insert uses default for missing keys", async () => {
    const { s, calls } = recorder([]);
    await s.from("t").insert([{ a: 1 }, { a: 2, b: 3 }]);
    expect(calls[0]!.text).toBe('insert into "t" ("a", "b") values ($1, default), ($2, $3) returning *');
  });

  it("update sets columns and keeps filters parameterised", async () => {
    const { s, calls } = recorder([]);
    await s.from("org_subscriptions").update({ status: "active", seats: null }).eq("org_id", "o");
    expect(calls[0]).toEqual({
      // filters bind first (they're called first), then the set values
      text: 'update "org_subscriptions" set "status" = $2, "seats" = $3 where "org_id" = $1 returning *',
      params: ["o", "active", null],
    });
  });

  it("keeps Postgres error codes (23505 duplicate checks still work)", async () => {
    const { s } = recorder([], Object.assign(new Error("duplicate key"), { code: "23505" }));
    const r = await s.from("billing_webhook_events").insert({ id: "evt_1" });
    expect(r.error).toMatchObject({ code: "23505", message: "duplicate key" });
    expect(r.data).toBeNull();
  });
});

describe("rpc", () => {
  it("calls with named args and unwraps a scalar", async () => {
    const { s, calls } = recorder([{ org_usage_total: "42" }]);
    const r = await s.rpc("org_usage_total", { p_org_id: "o", p_meter: "forms", p_since: new Date("2026-01-01T00:00:00Z") });
    expect(calls[0]).toEqual({
      text: 'select * from "org_usage_total"("p_org_id" => $1, "p_meter" => $2, "p_since" => $3)',
      params: ["o", "forms", "2026-01-01T00:00:00.000Z"],
    });
    expect(r.data).toBe("42");
  });

  it("reads pg-style { rows } results too", async () => {
    const { s } = recorder({ rows: [{ a: 1 }, { a: 2 }] });
    expect((await s.from("t").select()).data).toEqual([{ a: 1 }, { a: 2 }]);
  });
});

describe("migrations", () => {
  const billing = (f: string) => readFileSync(new URL(`../../billing/sql/${f}`, import.meta.url), "utf8");

  it("strips auth.users references and service_role grants from billing's SQL", () => {
    const sql = supabaseSqlForNeon(billing("0002_usage_ledger.sql"));
    expect(sql).not.toMatch(/auth\.users/);
    expect(sql).not.toMatch(/service_role/);
    expect(sql).toMatch(/created_by\s+uuid/);
  });

  it("splits into statements, keeping function bodies whole", () => {
    const stmts = splitSql(supabaseSqlForNeon(billing("0002_usage_ledger.sql")));
    const fn = stmts.find((s) => s.includes("function public.org_usage_total"));
    expect(fn).toMatch(/\$\$[\s\S]*\$\$/);
    expect(stmts.every((s) => !s.startsWith("--"))).toBe(true);
    expect(splitSql(billing("0001_billing.sql")).length).toBeGreaterThan(5);
  });
});
