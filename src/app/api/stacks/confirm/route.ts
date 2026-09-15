import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDB } from "@/lib/registry/db";
import { loadRegistry } from "@/lib/registry/queries";
import { stackInput } from "@/lib/stack/request";
import { validateStack } from "@/lib/stack/engine";
import { readBody, apiError } from "@/lib/api";
import { logEvent } from "@/lib/analytics";
export async function POST(req: Request) {
  try {
    const input = stackInput.parse(await readBody(req));
    const result = await getDB().transaction(async (db) => {
      const r = await loadRegistry(db, input.business_spec),
        v = validateStack(input.business_spec, r, input.selected_stack);
      if (!v.valid) return { status: 422, data: v };
      if (r.version !== input.registry_snapshot_version)
        return {
          status: 409,
          data: {
            ...v,
            code: "REGISTRY_CHANGED",
            registry_snapshot_version: r.version,
            error:
              "Registry changed. Review the updated prices and validation, then confirm again.",
          },
        };
      if (v.warnings.length && !input.acknowledge_uncertainty)
        return {
          status: 409,
          data: {
            ...v,
            error:
              "Review and acknowledge the remaining verification items before confirming this planning stack.",
          },
        };
      const id = randomUUID();
      await db.query(
        "INSERT INTO confirmed_stacks(id,registry_version,selection,pricing_snapshot,warnings,architecture_edges) VALUES($1,$2,$3,$4,$5,$6)",
        [
          id,
          r.version,
          JSON.stringify(input.selected_stack),
          JSON.stringify(v.pricing_snapshot),
          JSON.stringify(v.warnings),
          JSON.stringify(v.architecture_edges),
        ],
      );
      return {
        status: 200,
        data: {
          ...v,
          id,
          validated_stack: input.selected_stack,
          registry_snapshot_version: r.version,
          confirmed_at: new Date().toISOString(),
        },
      };
    });
    if (result.status === 200) logEvent("stack_confirmed");
    return NextResponse.json(result.data, { status: result.status });
  } catch (e) {
    return apiError(e);
  }
}
