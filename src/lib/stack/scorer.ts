import type { BusinessSpec } from "../requirements/schema";
import type { Registry, Tool } from "../registry/types";
import { calculatePricing } from "../pricing/calculator";
export const scoringWeights = {
  requirement_fit: 0.3,
  existing_compatibility: 0.2,
  connection_confidence: 0.15,
  cost_efficiency: 0.15,
  setup_simplicity: 0.1,
  scalability: 0.05,
  readiness: 0.05,
};
export function confidence(score: number) {
  return score >= 90
    ? "Strong Match"
    : score >= 75
      ? "Recommended"
      : score >= 60
        ? "Viable Alternative"
        : "Weak Match";
}
export function weightedScore(
  parts: Record<keyof typeof scoringWeights, number>,
) {
  return Math.round(
    Object.entries(scoringWeights).reduce(
      (sum, [k, w]) => sum + w * parts[k as keyof typeof parts],
      0,
    ),
  );
}
export function scoreTool(
  tool: Tool,
  capabilities: string[],
  neighbors: string[],
  spec: BusinessSpec,
  registry: Registry,
) {
  const edges = neighbors
    .filter((n) => n !== tool.id)
    .map((n) =>
      registry.connections.find(
        (c) =>
          (c.tool_a_id === n && c.tool_b_id === tool.id) ||
          (c.tool_b_id === n && c.tool_a_id === tool.id),
      ),
    );
  const connection = edges.length
    ? edges.reduce(
        (sum, c) =>
          sum +
          (!c
            ? 20
            : c.connection_type === "unsupported" ||
                ["RESTRICTED", "RETIRED"].includes(c.readiness_status)
              ? 0
              : c.verified
                ? 100
                : 45),
        0,
      ) / edges.length
    : 50;
  const price = calculatePricing([tool], spec),
    budget = spec.financials.monthly_software_budget;
  const parts = {
    requirement_fit: Math.min(
      100,
      75 +
        (25 *
          tool.capabilities.filter((c) => capabilities.includes(c)).length) /
          Math.max(1, capabilities.length),
    ),
    existing_compatibility: spec.existing_tools.some((t) =>
      [tool.id, tool.name.toLowerCase()].includes(t.toLowerCase()),
    )
      ? 100
      : connection,
    connection_confidence: connection,
    cost_efficiency:
      price.lines[0]?.min === 0 && price.unknowns.length
        ? 20
        : budget !== null
          ? Math.max(0, 100 * (1 - price.fixed_monthly / Math.max(1, budget)))
          : 50,
    setup_simplicity:
      tool.integration_route === "Visual"
        ? 90
        : tool.integration_route === "Configured API"
          ? 60
          : 30,
    scalability: tool.limits.some((l) => l.value !== null) ? 70 : 30,
    readiness: {
      RESEARCHED: 30,
      CONFIGURED: 50,
      TESTED: 80,
      SUPPORTED: 100,
      RESTRICTED: 0,
      RETIRED: 0,
    }[tool.readiness],
  };
  let score = weightedScore(parts);
  if (tool.readiness === "RESEARCHED") score = Math.min(score, 74);
  return score;
}
