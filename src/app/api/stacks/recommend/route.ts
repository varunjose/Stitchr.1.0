import { NextResponse } from "next/server";
import { getDB } from "@/lib/registry/db";
import { loadRegistry } from "@/lib/registry/queries";
import { businessSpecSchema } from "@/lib/requirements/schema";
import { recommend } from "@/lib/stack/engine";
import { readBody, apiError } from "@/lib/api";
import { logEvent } from "@/lib/analytics";
export async function POST(req: Request) {
  try {
    const start = Date.now(),
      spec = businessSpecSchema.parse(await readBody(req));
    const result = await getDB().transaction(async (db) =>
      recommend(spec, await loadRegistry(db, spec)),
    );
    logEvent("stack_generated", {
      latency_ms: Date.now() - start,
      tool_count: new Set(Object.values(result.selection)).size,
      templates: result.template_match.map((t) => t.template_id).join(","),
      warning_count: result.warnings.length,
    });
    return NextResponse.json(result);
  } catch (e) {
    return apiError(e);
  }
}
