import { resolveRequiredEdges, validateEdges } from "./graph";
import type { BusinessSpec } from "../requirements/schema";
import type { Registry, Tool } from "../registry/types";
import {
  calculatePricing,
  choosePlan,
  metricValue,
} from "../pricing/calculator";
export function exclusionReasons(
  tool: Tool,
  capability: string,
  spec: BusinessSpec,
  registry: Registry,
): string[] {
  const r: string[] = [];
  const c = spec.constraints;
  const p = choosePlan(tool, spec);
  if (!tool.capabilities.includes(capability))
    r.push("Required capability unavailable");
  if (["RETIRED", "RESTRICTED"].includes(tool.readiness))
    r.push("Tool retired or restricted");
  if (c.supported_only && tool.readiness !== "SUPPORTED")
    r.push("No supported option currently available");
  if (
    c.strict_no_code &&
    (tool.integration_route !== "Visual" || tool.readiness !== "SUPPORTED")
  )
    r.push("No tested strict no-code route");
  if (
    c.self_host_required &&
    !["self_hosted", "both"].includes(tool.hosted_or_self_hosted)
  )
    r.push("Self-hosting not established");
  if (
    spec.preferences.self_hosting_allowed === false &&
    tool.hosted_or_self_hosted === "self_hosted"
  )
    r.push("Self-hosting excluded");
  if (c.api_required && tool.api_support !== true)
    r.push("Required API access not verified");
  if (c.webhooks_required && tool.webhook_support !== true)
    r.push("Required webhook support not verified");
  const region = tool.regions.find((x) => x.country === spec.country);
  if (region?.supported === false) r.push("Country unavailable");
  if (c.verified_region_required && region?.supported !== true)
    r.push("Country support unverified");
  const physical =
    /kitchen|restaurant|physical|online store|ecommerce|e-commerce/.test(
      [spec.business_type, ...spec.business_model].join(" ").toLowerCase(),
    );
  if (
    physical &&
    tool.business_models.length &&
    !tool.business_models.includes("physical")
  )
    r.push("Business model unsupported");
  for (const l of tool.limits) {
    const n = metricValue(spec, l.metric);
    if (
      l.value !== null &&
      n !== null &&
      n > l.value &&
      (!l.plan_id || l.plan_id === p.id)
    )
      r.push("Usage exceeds available plan limit");
  }
  if (c.budget_is_hard) {
    const price = calculatePricing([tool], spec);
    if (
      !price.complete ||
      p.base_price === null ||
      price.fixed_monthly > (spec.financials.monthly_software_budget ?? 0)
    )
      r.push("Fixed software budget cannot be met");
  }
  for (const edge of resolveRequiredEdges(spec, registry).filter(
    (e) => e.from === tool.id || e.to === tool.id,
  )) {
    // Check the candidate route with its endpoint plans. Actual middleware presence
    // and the final endpoint selections are checked again at confirmation.
    const route = registry.connections.find(
      (connection) =>
        (connection.tool_a_id === edge.from &&
          connection.tool_b_id === edge.to) ||
        (connection.tool_b_id === edge.from &&
          connection.tool_a_id === edge.to),
    );
    const proposed = {
      from: edge.from,
      to: edge.to,
      ...(route?.middleware_tool_id
        ? { middleware: route.middleware_tool_id }
        : {}),
    };
    const state = validateEdges(proposed, registry, [edge], spec)[0];
    if (!state || state.status !== "verified")
      r.push("Required integration not verified");
  }

  return r;
}
