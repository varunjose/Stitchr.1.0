import { beforeAll, afterAll, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { getDB, type DB } from "../src/lib/registry/db";
import { loadRegistry } from "../src/lib/registry/queries";
import { emptySpec } from "../src/lib/requirements/schema";
import { recommend } from "../src/lib/stack/engine";
import { POST as confirm } from "../src/app/api/stacks/confirm/route";
import { POST as revalidate } from "../src/app/api/stacks/revalidate/route";
import { POST as analyze } from "../src/app/api/onboarding/analyze/route";
let db: DB;
let dir: string;
const spec = () => ({
  ...emptySpec(),
  business_type: "custom",
  country: "US",
  required_features: ["payments"],
  expected_usage: { ...emptySpec().expected_usage, monthly_orders: 1000 },
  financials: { ...emptySpec().financials, average_transaction_value: 35 },
});
const req = (path: string, body: unknown) =>
  new Request("http://localhost:3000" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "stitchr-db-"));
  process.env.REGISTRY_DRIVER = "pglite";
  process.env.PGLITE_PATH = dir;
  process.env.REQUIREMENTS_MODE = "demo";
  for (const f of ["migrate", "seed"])
    execFileSync(process.execPath, ["--import", "tsx", `scripts/${f}.ts`], {
      env: process.env,
    });
  db = getDB();
}, 30000);
afterAll(async () => {
  await db.close();
  rmSync(dir, { recursive: true, force: true });
});
it("creates a real PostgreSQL relational registry with all tool plans and source provenance", async () => {
  expect(
    (await db.query<{ n: number }>("SELECT count(*)::int n FROM tools")).rows[0]
      .n,
  ).toBe(156);
  expect(
    (await db.query<{ n: number }>("SELECT count(*)::int n FROM tool_plans"))
      .rows[0].n,
  ).toBe(156);
  expect(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM registry_sources",
      )
    ).rows[0].n,
  ).toBe(1);
});
it("queries capability candidates in the database rather than loading the full catalog", async () => {
  const r = await loadRegistry(db, spec());
  expect(r.tools.length).toBeLessThan(30);
  expect(r.tools.some((t) => t.id === "stripe")).toBe(true);
  expect(r.tools.some((t) => t.id === "bamboohr")).toBe(false);
  expect(
    r.tools.every(
      (t) =>
        typeof t.plans[0].base_price === "number" ||
        t.plans[0].base_price === null,
    ),
  ).toBe(true);
});
it("SQL excludes mandatory unsupported region/API requirements", async () => {
  const s = spec();
  s.constraints.verified_region_required = true;
  expect((await loadRegistry(db, s)).tools).toHaveLength(0);
  s.constraints.verified_region_required = false;
  s.constraints.api_required = true;
  expect((await loadRegistry(db, s)).tools).toHaveLength(0);
});
it("server rejects a forged selection and does not persist it", async () => {
  const r = await loadRegistry(db, spec());
  const res = await confirm(
    req("/api/stacks/confirm", {
      business_spec: spec(),
      selected_stack: { payments: "invented" },
      registry_snapshot_version: r.version,
    }),
  );
  expect(res.status).toBe(422);
  expect(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM confirmed_stacks",
      )
    ).rows[0].n,
  ).toBe(0);
});
it("requires acknowledgment for researched planning stack, then persists an authoritative pricing snapshot", async () => {
  const s = spec(),
    r = await loadRegistry(db, s),
    body = {
      business_spec: s,
      selected_stack: { payments: "stripe" },
      registry_snapshot_version: r.version,
    };
  const first = await confirm(req("/api/stacks/confirm", body));
  expect(first.status).toBe(409);
  const res = await confirm(
    req("/api/stacks/confirm", { ...body, acknowledge_uncertainty: true }),
  );
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.pricing_snapshot.transaction_estimate.min).toBe(1315);
  expect(data.ready_to_connect).toBe(false);
  expect(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM confirmed_stacks",
      )
    ).rows[0].n,
  ).toBe(1);
});
it("detects a changed registry revision and demands review of refreshed evidence", async () => {
  const s = spec(),
    r = await loadRegistry(db, s);
  await db.query("UPDATE tool_plans SET base_price=5 WHERE tool_id=$1", [
    "stripe",
  ]);
  const res = await confirm(
    req("/api/stacks/confirm", {
      business_spec: s,
      selected_stack: { payments: "stripe" },
      registry_snapshot_version: r.version,
      acknowledge_uncertainty: true,
    }),
  );
  expect(res.status).toBe(409);
  const data = await res.json();
  expect(data.code).toBe("REGISTRY_CHANGED");
  expect(data.pricing_snapshot.fixed_monthly).toBe(5);
  await db.query("UPDATE tool_plans SET base_price=0 WHERE tool_id=$1", [
    "stripe",
  ]);
});
it("revalidation gets latest registry state and returns new prices", async () => {
  const s = spec(),
    r = await loadRegistry(db, s);
  const res = await revalidate(
    req("/api/stacks/revalidate", {
      business_spec: s,
      previous_stack: { payments: "paypal" },
      selected_stack: { payments: "stripe" },
      registry_snapshot_version: r.version,
    }),
  );
  expect(res.status).toBe(200);
  expect((await res.json()).updated_pricing.transaction_estimate.min).toBe(
    1315,
  );
});
it("extracts and validates schema through the demo API", async () => {
  const res = await analyze(
    req("/api/onboarding/analyze", {
      conversation: [
        {
          role: "user",
          content:
            "A cloud kitchen in the US with 1000 orders per month, $35 average order, own drivers, $1000 software budget.",
        },
      ],
    }),
  );
  expect(res.status).toBe(200);
  expect((await res.json()).mode).toBe("demo");
});
it("does not silently use a demo when AI is not configured", async () => {
  const key = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  process.env.REQUIREMENTS_MODE = "openai";
  const res = await analyze(
    req("/api/onboarding/analyze", {
      conversation: [{ role: "user", content: "Build a kitchen" }],
    }),
  );
  expect(res.status).toBe(503);
  expect((await res.json()).code).toBe("AI_NOT_CONFIGURED");
  process.env.REQUIREMENTS_MODE = "demo";
  if (key) process.env.OPENAI_API_KEY = key;
});
it("rejects request fields outside the validated schema", async () => {
  const res = await confirm(
    req("/api/stacks/confirm", {
      business_spec: spec(),
      selected_stack: { payments: "stripe" },
      registry_snapshot_version: "x",
      price: 0,
    }),
  );
  expect(res.status).toBe(400);
});
it("database output produces deterministic recommendations", async () => {
  const r = await loadRegistry(db, spec());
  expect(recommend(spec(), r)).toEqual(recommend(spec(), r));
});
