/** Runs an isolated local HTTP journey, without any vendor connections or AI charges. */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "stitchr-http-"));
const env = {
  ...process.env,
  REGISTRY_DRIVER: "pglite",
  PGLITE_PATH: dir,
  REQUIREMENTS_MODE: "demo",
};
for (const f of ["migrate", "seed"])
  execFileSync(process.execPath, ["--import", "tsx", `scripts/${f}.ts`], {
    env,
  });
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "-p",
    "3107",
    "--hostname",
    "0.0.0.0",
  ],
  { env, stdio: ["ignore", "pipe", "pipe"] },
);
let output = "";
server.stdout.on("data", (b) => (output += b));
server.stderr.on("data", (b) => (output += b));
const base = "http://127.0.0.1:3107";
async function post(path: string, body: unknown) {
  const res = await fetch(base + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      "Sec-Fetch-Site": "same-origin",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Error(`${path}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}
try {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(base);
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  const page = await fetch(base).then((r) => r.text());
  if (!page.includes("What are you") || !page.includes("Local demo"))
    throw Error("Initial UI or demo disclosure absent");
  const event = await fetch(base + "/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ event: "onboarding_started", metadata: {} }),
  });
  if (event.status !== 204)
    throw Error("Same-origin analytics request rejected");
  const crossOrigin = await fetch(base + "/api/onboarding/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://untrusted.example",
    },
    body: JSON.stringify({ conversation: [] }),
  });
  if (crossOrigin.status !== 403)
    throw Error("Cross-origin request was accepted");
  const a = await post("/api/onboarding/analyze", {
    conversation: [
      {
        role: "user",
        content:
          "Cloud kitchen in the US, 1000 orders monthly, $35 average order, own drivers, one location, guest checkout, $1000 software budget.",
      },
    ],
  });
  const r = await post("/api/stacks/recommend", a.business_spec);
  const selection = { ...r.selection };
  for (const c of r.categories) {
    if (!selection[c.capability]) {
      if (!c.recommendations.length)
        throw Error(`Missing candidates: ${c.capability}`);
      selection[c.capability] = c.recommendations[0].tool.id;
    }
  }
  const check = await post("/api/stacks/revalidate", {
    business_spec: a.business_spec,
    previous_stack: r.selection,
    selected_stack: selection,
    registry_snapshot_version: r.registry_snapshot_version,
  });
  if (!check.validation.valid) throw Error(check.validation.errors.join("; "));
  const confirmed = await post("/api/stacks/confirm", {
    business_spec: a.business_spec,
    selected_stack: selection,
    registry_snapshot_version: r.registry_snapshot_version,
    acknowledge_uncertainty: true,
  });
  console.log(
    JSON.stringify({
      http_journey: "passed",
      capabilities: r.capabilities.length,
      tools: new Set(Object.values(selection)).size,
      known_subtotal: confirmed.pricing_snapshot.estimated_min,
      planning_stack_id: confirmed.id,
      ready_to_connect: confirmed.ready_to_connect,
    }),
  );
} finally {
  server.kill("SIGTERM");
  if (server.exitCode === null)
    await new Promise<void>((resolve) => server.on("exit", () => resolve()));
  rmSync(dir, { recursive: true, force: true });
}
