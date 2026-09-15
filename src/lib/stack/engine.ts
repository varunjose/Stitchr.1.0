import type { BusinessSpec } from "../requirements/schema";
import type {
  Candidate,
  Registry,
  Recommendation,
  Selection,
  Tool,
} from "../registry/types";
import { choosePlan, calculatePricing, money } from "../pricing/calculator";
import { mapCapabilities, matchTemplates, label } from "./capabilities";
import { exclusionReasons } from "./constraints";
import { scoreTool, confidence } from "./scorer";
import {
  validateEdges,
  affectedTools,
  dependencyPairs,
  resolveRequiredEdges,
} from "./graph";
const selectedTools = (selection: Selection, registry: Registry) =>
  registry.tools.filter((t) => Object.values(selection).includes(t.id));
function hasConflict(
  tool: Tool,
  cap: string,
  selection: Selection,
  registry: Registry,
) {
  return validateEdges({ ...selection, [cap]: tool.id }, registry).some(
    (e) =>
      e.status === "incompatible" && (e.from === tool.id || e.to === tool.id),
  );
}
export function rankCandidates(
  cap: string,
  caps: string[],
  spec: BusinessSpec,
  r: Registry,
  selection: Selection,
): Candidate[] {
  const neighbors = dependencyPairs({ ...selection, [cap]: "__candidate__" })
    .filter((e) => e.from === "__candidate__" || e.to === "__candidate__")
    .map((e) => (e.from === "__candidate__" ? e.to : e.from));
  return r.tools
    .filter(
      (t) =>
        !exclusionReasons(t, cap, spec, r).length &&
        !hasConflict(t, cap, selection, r),
    )
    .map((tool) => {
      const plan = choosePlan(tool, spec),
        score = scoreTool(
          tool,
          caps,
          [
            ...neighbors,
            ...spec.existing_tools
              .map(
                (n) =>
                  r.tools.find(
                    (t) =>
                      t.id === n || t.name.toLowerCase() === n.toLowerCase(),
                  )?.id,
              )
              .filter((n): n is string => !!n),
          ],
          spec,
          r,
        );
      const edges = validateEdges({ ...selection, [cap]: tool.id }, r).filter(
        (e) => e.from === tool.id || e.to === tool.id,
      );
      const verification_warnings = [
        ...(tool.readiness === "RESEARCHED"
          ? ["Researched candidate; not a Stitchr supported integration"]
          : []),
        ...(!tool.regions.some((x) => x.country === spec.country && x.supported)
          ? ["Country availability requires confirmation"]
          : []),
        ...(plan.production_eligible !== true
          ? ["Required plan and production eligibility need verification"]
          : []),
      ];
      return {
        tool,
        plan,
        fit_score: score,
        confidence: confidence(score),
        why_recommended: [
          `Catalog describes ${label(cap).toLowerCase()} support`,
          ...(tool.capabilities.filter((c) => caps.includes(c)).length > 1
            ? [
                `Can cover ${tool.capabilities.filter((c) => caps.includes(c)).length} of your needs in one product`,
              ]
            : []),
          ...(spec.existing_tools.some((n) =>
            [tool.id, tool.name.toLowerCase()].includes(n.toLowerCase()),
          )
            ? ["Keeps a tool you already use"]
            : []),
        ],
        price_summary:
          plan.base_price === null
            ? plan.price_status === "custom_quote"
              ? "Custom quote"
              : "Price unavailable"
            : plan.rules.length
              ? plan.price_text
              : `${money(plan.base_price, plan.currency)}/month${plan.billing_period === "annual" ? " · annual commitment" : plan.billing_period === "unknown" ? " · term unconfirmed" : ""}`,
        limitations: [tool.constraints],
        connection_quality:
          edges.length && edges.every((e) => e.status === "verified")
            ? "Verified connections"
            : "Needs verification",
        dependency_notes: edges
          .filter((e) => e.status !== "verified")
          .map((e) => e.notes),
        verification_warnings,
      };
    })
    .sort(
      (a, b) => b.fit_score - a.fit_score || a.tool.id.localeCompare(b.tool.id),
    );
}
export function optimize(
  caps: string[],
  spec: BusinessSpec,
  r: Registry,
): Selection {
  const selected: Selection = {};
  const remaining = new Set(caps);
  // Preserve existing products; unavailable ones are surfaced as explicit gaps.
  for (const name of spec.existing_tools) {
    const tool = r.tools.find(
      (t) => t.id === name || t.name.toLowerCase() === name.toLowerCase(),
    );
    if (!tool) continue;
    selected["existing:" + tool.id] = tool.id;
    for (const cap of caps)
      if (!exclusionReasons(tool, cap, spec, r).length) {
        selected[cap] = tool.id;
        remaining.delete(cap);
      }
  }
  while (remaining.size) {
    const choices = r.tools
      .map((tool) => {
        const covered = [...remaining].filter(
          (c) =>
            !exclusionReasons(tool, c, spec, r).length &&
            !hasConflict(tool, c, selected, r),
        );
        const price = calculatePricing([tool], spec);
        const score = scoreTool(tool, caps, Object.values(selected), spec, r);
        return {
          tool,
          covered,
          score,
          utility:
            covered.length * 100 +
            score -
            (price.fixed_monthly > 0
              ? Math.min(80, price.fixed_monthly / 10)
              : 0),
        };
      })
      .filter((c) => c.covered.length && c.score >= 60)
      .sort(
        (a, b) => b.utility - a.utility || a.tool.id.localeCompare(b.tool.id),
      );
    const choice = choices.find(
      (c) =>
        !spec.constraints.budget_is_hard ||
        calculatePricing([...selectedTools(selected, r), c.tool], spec)
          .fixed_monthly <= (spec.financials.monthly_software_budget ?? 0),
    );
    if (!choice) break;
    for (const c of choice.covered) {
      selected[c] = choice.tool.id;
      remaining.delete(c);
    }
  }
  return selected;
}
export function recommend(
  spec: BusinessSpec,
  r: Registry,
  selection?: Selection,
): Recommendation {
  const matched = matchTemplates(spec, r.templates),
    caps = mapCapabilities(spec, matched);
  const chosen = selection ?? optimize(caps, spec, r);
  const categories = caps.map((cap) => ({
    capability: cap,
    required: true,
    selected_tool: chosen[cap] ?? null,
    recommendations: rankCandidates(cap, caps, spec, r, chosen),
  }));
  const warnings = [
    ...categories
      .filter((c) => !c.recommendations.length)
      .map(
        (c) =>
          `${label(c.capability)}: No supported option currently available under these requirements`,
      ),
    ...categories
      .filter(
        (c) =>
          c.recommendations.length &&
          c.recommendations.every((t) => t.fit_score < 60),
      )
      .map(
        (c) =>
          `${label(c.capability)}: only weak matches; consider refining this requirement`,
      ),
    ...validateEdges(chosen, r, resolveRequiredEdges(spec, r), spec)
      .filter((e) => e.status !== "verified")
      .map((e) => `${e.from} → ${e.to}: ${e.notes}`),
    ...spec.existing_tools
      .filter(
        (name) =>
          !r.tools.some(
            (t) => t.id === name || t.name.toLowerCase() === name.toLowerCase(),
          ),
      )
      .map(
        (name) =>
          `${name}: existing tool is unavailable or cannot satisfy mandatory constraints`,
      ),
  ];
  if (!spec.country)
    warnings.push(
      "Country is unknown; availability and regional pricing need confirmation",
    );
  const age = (Date.now() - Date.parse(r.researched_at)) / 86400000;
  if (age > 30)
    warnings.push(
      "Registry research is over 30 days old; recheck vendor terms",
    );
  const pricing = calculatePricing(selectedTools(chosen, r), spec);
  if (
    spec.financials.monthly_software_budget !== null &&
    pricing.fixed_monthly > spec.financials.monthly_software_budget
  )
    warnings.push("Known fixed software costs exceed your preferred budget");
  return {
    selected_tools: selectedTools(chosen, r),
    business_spec: spec,
    template_match: matched,
    capabilities: caps,
    categories,
    pricing,
    warnings: [...new Set(warnings)],
    registry_snapshot_version: r.version,
    selection: chosen,
    connections: r.connections,
    required_edges: dependencyPairs(chosen, resolveRequiredEdges(spec, r)),
  };
}
export function revalidate(
  spec: BusinessSpec,
  r: Registry,
  previous: Selection,
  next: Selection,
) {
  const changed = [
    ...new Set(
      [...Object.keys(previous), ...Object.keys(next)]
        .filter((k) => previous[k] !== next[k])
        .flatMap((k) => [previous[k], next[k]])
        .filter(Boolean),
    ),
  ];
  const affected = affectedTools(previous, next, r, changed);
  const caps = mapCapabilities(spec, matchTemplates(spec, r.templates));
  const affected_capabilities = changed.length
    ? caps.filter(
        (c) =>
          affected.has(previous[c]) ||
          affected.has(next[c]) ||
          previous[c] !== next[c],
      )
    : caps;
  const replacement_recommendations = affected_capabilities.map(
    (capability) => ({
      capability,
      required: true,
      selected_tool: next[capability] ?? null,
      recommendations: rankCandidates(capability, caps, spec, r, next),
    }),
  );
  return {
    affected_capabilities,
    replacement_recommendations,
    compatibility_changes: validateEdges(
      next,
      r,
      resolveRequiredEdges(spec, r),
      spec,
    ),
    updated_pricing: calculatePricing(selectedTools(next, r), spec),
    validation: validateStack(spec, r, next),
    registry_snapshot_version: r.version,
  };
}
export function validateStack(
  spec: BusinessSpec,
  r: Registry,
  selection: Selection,
) {
  const errors: string[] = [],
    warnings: string[] = [];
  const caps = mapCapabilities(spec, matchTemplates(spec, r.templates));
  for (const cap of caps) {
    const t = r.tools.find((t) => t.id === selection[cap]);
    if (!t) {
      errors.push(`${label(cap)}: choose a valid tool`);
      continue;
    }
    for (const e of exclusionReasons(t, cap, spec, r))
      errors.push(`${t.name}: ${e}`);
  }
  for (const [cap, id] of Object.entries(selection)) {
    const t = r.tools.find((t) => t.id === id);
    if (!t) errors.push(`Unknown or excluded tool: ${id}`);
    if (
      !caps.includes(cap) &&
      !spec.existing_tools.some(
        (n) =>
          cap === "existing:" + id &&
          t &&
          (n === id || n.toLowerCase() === t.name.toLowerCase()),
      )
    )
      errors.push("Unrecognized selection role");
  }
  for (const name of spec.existing_tools) {
    const t = r.tools.find(
      (t) => t.id === name || t.name.toLowerCase() === name.toLowerCase(),
    );
    if (!t || !Object.values(selection).includes(t.id))
      errors.push(`${name}: required existing tool is missing or excluded`);
  }
  const required = resolveRequiredEdges(spec, r);
  for (const requiredEdge of required) {
    if (
      !Object.values(selection).includes(requiredEdge.from) ||
      !Object.values(selection).includes(requiredEdge.to)
    )
      errors.push("A required integration endpoint is missing");
  }
  const edges = validateEdges(selection, r, required, spec);
  for (const edge of edges)
    if (
      required.some(
        (e) =>
          e.from === edge.from &&
          e.to === edge.to &&
          e.operation === edge.operation,
      ) &&
      edge.status !== "verified"
    )
      errors.push(
        `${edge.from} → ${edge.to}: Required integration not verified`,
      );
  for (const e of edges) {
    if (e.status === "incompatible")
      errors.push(`${e.from} → ${e.to}: ${e.notes}`);
    else if (e.status === "unverified")
      warnings.push(`${e.from} → ${e.to}: Compatibility not yet verified`);
  }
  const pricing = calculatePricing(selectedTools(selection, r), spec);
  if (
    spec.constraints.budget_is_hard &&
    (!pricing.complete ||
      pricing.fixed_monthly > (spec.financials.monthly_software_budget ?? 0) ||
      pricing.lines.some(
        (l) =>
          choosePlan(
            r.tools.find((t) => t.id === l.tool_id)!,
            spec,
          ).base_price === null,
      ))
  )
    errors.push("Fixed software budget cannot be validated");
  for (const tool of selectedTools(selection, r)) {
    if (["RETIRED", "RESTRICTED"].includes(tool.readiness))
      errors.push(`${tool.name}: tool retired or restricted`);
    if (tool.readiness !== "SUPPORTED")
      warnings.push(
        `${tool.name}: ${tool.readiness.toLowerCase()} only; production readiness unverified`,
      );
    if (!tool.regions.some((x) => x.country === spec.country && x.supported))
      warnings.push(`${tool.name}: country availability requires verification`);
  }
  warnings.push(...pricing.unknowns);
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    architecture_edges: edges,
    pricing_snapshot: pricing,
    ready_to_connect: errors.length === 0 && warnings.length === 0,
  };
}
