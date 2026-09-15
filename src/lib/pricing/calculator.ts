import type { BusinessSpec } from "../requirements/schema";
import type { Plan, Pricing, Rule, Tool } from "../registry/types";
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function metricValue(spec: BusinessSpec, metric: string): number | null {
  if (metric === "revenue") {
    const n =
      spec.expected_usage.monthly_transactions ??
      spec.expected_usage.monthly_orders;
    const avg = spec.financials.average_transaction_value;
    return n !== null && avg !== null
      ? n * avg
      : spec.financials.expected_monthly_revenue;
  }
  if (metric === "monthly_transactions")
    return (
      spec.expected_usage.monthly_transactions ??
      spec.expected_usage.monthly_orders
    );
  return (spec.expected_usage as Record<string, number | null>)[metric] ?? null;
}
export function calculateRule(
  rule: Rule,
  value: number | null,
): { min: number; max: number } | null {
  if (rule.formula === "unknown" || rule.unit_price === null) return null;
  if (rule.formula === "fixed")
    return {
      min: rule.unit_price,
      max: rule.max_unit_price ?? rule.unit_price,
    };
  if (value === null) return null;
  if (rule.formula === "tiered") {
    if (!rule.tiers?.length) return null;
    let previous = 0,
      total = 0;
    for (const t of rule.tiers) {
      total +=
        Math.max(0, Math.min(value, t.up_to ?? Infinity) - previous) *
        t.unit_price;
      previous = t.up_to ?? Infinity;
      if (value <= previous) break;
    }
    return { min: round(total), max: round(total) };
  }
  if (rule.formula === "minimum") {
    const cost = Math.max(rule.threshold, value * rule.unit_price);
    return { min: round(cost), max: round(cost) };
  }
  const units = Math.max(0, value - rule.threshold);
  return {
    min: round(units * rule.unit_price),
    max: round(units * (rule.max_unit_price ?? rule.unit_price)),
  };
}
export function eligiblePlans(tool: Tool, spec: BusinessSpec) {
  return tool.plans
    .filter(
      (p) =>
        p.production_eligible !== false &&
        (!p.country || p.country === spec.country) &&
        p.currency === spec.currency,
    )
    .sort(
      (a, b) =>
        (a.base_price ?? Infinity) - (b.base_price ?? Infinity) ||
        a.id.localeCompare(b.id),
    );
}
export function choosePlan(tool: Tool, spec: BusinessSpec): Plan {
  return (
    eligiblePlans(tool, spec)[0] ?? {
      id: tool.id + "-quote",
      tool_id: tool.id,
      name: "Target-market quote required",
      currency: spec.currency,
      billing_period: "unknown",
      base_price: null,
      pricing_type: "unknown",
      included_units: {},
      plan_requirements: tool.constraints,
      price_status: "requires_confirmation",
      price_text: tool.plans[0]?.price_text ?? "Price unavailable",
      rules: [],
      country: spec.country,
      production_eligible: null,
      complete_price: false,
    }
  );
}
export function calculatePricing(tools: Tool[], spec: BusinessSpec): Pricing {
  const p: Pricing = {
    assumptions: { ...spec.expected_usage, ...spec.financials },
    currency: spec.currency,
    fixed_monthly: 0,
    variable_estimate: { min: 0, max: 0 },
    transaction_estimate: { min: 0, max: 0 },
    optional_estimate: { min: 0, max: 0 },
    estimated_min: 0,
    estimated_max: 0,
    complete: true,
    unknowns: [],
    lines: [],
  };
  for (const tool of [...new Map(tools.map((t) => [t.id, t])).values()].sort(
    (a, b) => a.id.localeCompare(b.id),
  )) {
    const plan = choosePlan(tool, spec);
    let min = plan.base_price ?? 0,
      max = min,
      partial = false;
    if (plan.base_price === null) {
      p.unknowns.push(
        `${tool.name}: ${plan.price_status === "custom_quote" ? "Custom quote" : "Price unavailable for the selected market and currency"}`,
      );
      partial = true;
    } else {
      p.fixed_monthly += plan.base_price;
      if (plan.billing_period === "unknown") {
        p.unknowns.push(`${tool.name}: billing term requires confirmation`);
        partial = true;
      }
    }
    for (const rule of plan.rules) {
      const result =
        !rule.country || rule.country === spec.country
          ? calculateRule(rule, metricValue(spec, rule.metric))
          : null;
      if (!result) {
        p.unknowns.push(
          `${tool.name}: ${rule.metric.replaceAll("_", " ")} or rate needed`,
        );
        partial = true;
        continue;
      }
      if (rule.bucket === "fixed") p.fixed_monthly += result.min;
      else {
        const bucket =
          rule.bucket === "transaction"
            ? p.transaction_estimate
            : rule.bucket === "optional"
              ? p.optional_estimate
              : p.variable_estimate;
        bucket.min += result.min;
        bucket.max += result.max;
      }
      min += result.min;
      max += result.max;
    }
    if (!plan.complete_price) {
      p.unknowns.push(
        `${tool.name}: plan eligibility, limits, and additional usage fees require confirmation`,
      );
      partial = true;
    }
    p.lines.push({
      tool_id: tool.id,
      name: tool.name,
      min: round(min),
      max: round(max),
      currency: spec.currency,
      partial,
    });
  }
  p.fixed_monthly = round(p.fixed_monthly);
  for (const b of [
    p.variable_estimate,
    p.transaction_estimate,
    p.optional_estimate,
  ]) {
    b.min = round(b.min);
    b.max = round(b.max);
  }
  p.estimated_min = round(
    p.fixed_monthly +
      p.variable_estimate.min +
      p.transaction_estimate.min +
      p.optional_estimate.min,
  );
  p.complete = p.unknowns.length === 0;
  p.estimated_max = p.complete
    ? round(
        p.fixed_monthly +
          p.variable_estimate.max +
          p.transaction_estimate.max +
          p.optional_estimate.max,
      )
    : null;
  return p;
}
export function money(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}
