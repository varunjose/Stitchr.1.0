import type { BusinessSpec } from "../requirements/schema";
import { choosePlan } from "../pricing/calculator";
import type { Connection, Registry, Selection } from "../registry/types";
import { capabilityEdges } from "./capabilities";
export interface Edge {
  from: string;
  to: string;
  operation: string | null;
  status: "verified" | "unverified" | "incompatible";
  connection: Connection | null;
  notes: string;
}
export function dependencyPairs(
  selection: Selection,
  extra: { from: string; to: string; operation: string | null }[] = [],
) {
  return [
    ...new Map(
      [
        ...capabilityEdges.map(([a, b]) => ({
          from: selection[a],
          to: selection[b],
          operation: null,
        })),
        ...extra,
      ]
        .filter((e) => e.from && e.to && e.from !== e.to)
        .map((e) => [e.from + "--" + e.to + "--" + e.operation, e]),
    ).values(),
  ];
}
export function validateEdges(
  selection: Selection,
  registry: Registry,
  extra: { from: string; to: string; operation: string | null }[] = [],
  spec?: BusinessSpec,
): Edge[] {
  return dependencyPairs(selection, extra).map((e) => {
    const c =
      registry.connections.find(
        (c) =>
          (c.tool_a_id === e.from && c.tool_b_id === e.to) ||
          (c.tool_a_id === e.to && c.tool_b_id === e.from),
      ) ?? null;
    const wrongDirection =
      c &&
      ((c.supported_direction === "a_to_b" && c.tool_a_id !== e.from) ||
        (c.supported_direction === "b_to_a" && c.tool_b_id !== e.from));
    const missingMiddleware =
      c?.middleware_tool_id &&
      !Object.values(selection).includes(c.middleware_tool_id);
    const wrongPlan =
      c?.required_plan_ids.length &&
      !c.required_plan_ids.every((id) =>
        registry.tools.some(
          (t) =>
            Object.values(selection).includes(t.id) &&
            (spec ? choosePlan(t, spec).id === id : t.plans[0]?.id === id),
        ),
      );
    const bad =
      c &&
      (c.connection_type === "unsupported" ||
        ["RESTRICTED", "RETIRED"].includes(c.readiness_status) ||
        wrongDirection ||
        missingMiddleware ||
        wrongPlan);
    const verified =
      c?.verified &&
      ["TESTED", "SUPPORTED"].includes(c.readiness_status) &&
      c.supported_direction !== "unknown" &&
      (!e.operation ||
        c.operations.some(
          (o) => o.operation_name === e.operation && o.verified,
        ));
    return {
      ...e,
      status: bad ? "incompatible" : verified ? "verified" : "unverified",
      connection: c,
      notes: bad
        ? "Connection, direction, middleware, or required plan is incompatible"
        : verified
          ? "Verified connection for this flow"
          : (c?.notes ??
            "Compatibility not yet verified; no connection evidence in the registry"),
    };
  });
}
export function affectedTools(
  previous: Selection,
  next: Selection,
  registry: Registry,
  changed: string[],
) {
  const neighbors = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    neighbors.get(a)!.add(b);
  };
  for (const e of [
    ...dependencyPairs(previous),
    ...dependencyPairs(next),
    ...registry.connections.map((c) => ({
      from: c.tool_a_id,
      to: c.tool_b_id,
    })),
  ]) {
    link(e.from, e.to);
    link(e.to, e.from);
  }
  // Direct neighbor validation only. Traverse further only if that neighbor is itself replaced.
  const out = new Set(changed);
  for (const id of changed)
    for (const n of neighbors.get(id) ?? [])
      if (
        Object.values(next).includes(n) ||
        Object.values(previous).includes(n)
      )
        out.add(n);
  return out;
}

export function resolveRequiredEdges(spec: BusinessSpec, registry: Registry) {
  const resolve = (name: string) =>
    registry.tools.find(
      (t) =>
        t.id === name.toLowerCase() ||
        t.name.toLowerCase() === name.toLowerCase(),
    )?.id ?? name;
  return spec.constraints.required_connections.map((e) => ({
    ...e,
    from: resolve(e.from),
    to: resolve(e.to),
  }));
}
