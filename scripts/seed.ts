import { getDB, type DB } from "../src/lib/registry/db";
import { catalogRegistry } from "../src/lib/registry/catalog";
import source from "../data/catalog.json";
import { capabilityNames, label } from "../src/lib/stack/capabilities";
async function insert(db: DB, table: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  const values = Object.values(row).map((v) =>
    typeof v === "object" && v !== null ? JSON.stringify(v) : v,
  );
  await db.query(
    `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map((_, i) => "$" + (i + 1)).join(",")}) ON CONFLICT DO NOTHING`,
    values,
  );
}
const db = getDB(),
  r = catalogRegistry();
await db.transaction(async (db) => {
  await insert(db, "registry_sources", {
    ...source.source,
    source_document: source,
  });
  for (const c of capabilityNames)
    await insert(db, "capabilities", { id: c, name: label(c) });
  for (const t of r.tools) {
    const {
      capabilities,
      plans,
      readiness,
      regions,
      limits,
      references,
      ...rest
    } = t;
    await insert(db, "tools", { ...rest, references_json: references });
    await insert(db, "tool_readiness", {
      tool_id: t.id,
      readiness_status: readiness,
      notes: "Catalog research only; no connected accounts or end-to-end tests",
    });
    for (const c of capabilities)
      await insert(db, "tool_capabilities", {
        tool_id: t.id,
        capability_id: c,
        support_level: "researched",
        notes: t.description,
      });
    for (const p of plans) {
      const { rules, ...row } = p;
      await insert(db, "tool_plans", row);
      for (const [i, rule] of rules.entries())
        await insert(db, "pricing_rules", {
          id: p.id + "-" + i,
          tool_plan_id: p.id,
          metric: rule.metric,
          unit_price: rule.unit_price,
          threshold: rule.threshold,
          formula_type: rule.formula,
          metadata: rule,
        });
    }
    for (const [i, l] of limits.entries())
      await insert(db, "tool_limits", {
        id: t.id + "-" + i,
        tool_id: t.id,
        ...l,
      });
  }
  for (const raw of source.tools)
    for (const [i, observation] of raw.observed_price_mentions.entries())
      await insert(db, "tool_price_observations", {
        id: raw.slug + "-" + i,
        tool_id: raw.slug,
        source_id: source.source.id,
        ...observation,
      });
  for (const c of r.connections) {
    const { operations, ...row } = c;
    await insert(db, "tool_connections", row);
    for (const op of operations)
      await insert(db, "connection_operations", { connection_id: c.id, ...op });
  }
  for (const t of r.templates) {
    const { default_capabilities, optional_capabilities, ...row } = t;
    await insert(db, "stack_templates", row);
    for (const c of default_capabilities)
      await insert(db, "template_capabilities", {
        template_id: t.template_id,
        capability_id: c,
        required: true,
      });
    for (const c of optional_capabilities)
      await insert(db, "template_capabilities", {
        template_id: t.template_id,
        capability_id: c,
        required: false,
      });
    for (const id of t.recommended_stack_pattern)
      await insert(db, "template_tools", {
        template_id: t.template_id,
        tool_id: id,
      });
  }
});
console.log(
  `Seeded ${r.tools.length} discovery tools, ${r.connections.length} researched connections, ${r.templates.length} templates`,
);
await db.close();
