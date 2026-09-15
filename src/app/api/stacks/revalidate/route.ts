import { NextResponse } from "next/server";
import { getDB } from "@/lib/registry/db";
import { loadRegistry } from "@/lib/registry/queries";
import { stackInput, selectionSchema } from "@/lib/stack/request";
import { revalidate, recommend } from "@/lib/stack/engine";
import { readBody, apiError } from "@/lib/api";
const schema = stackInput.extend({ previous_stack: selectionSchema });
export async function POST(req: Request) {
  try {
    const input = schema.parse(await readBody(req));
    return NextResponse.json(
      await getDB().transaction(async (db) => {
        const r = await loadRegistry(db, input.business_spec);
        return {
          ...revalidate(
            input.business_spec,
            r,
            input.previous_stack,
            input.selected_stack,
          ),
          refreshed_recommendation:
            r.version !== input.registry_snapshot_version
              ? recommend(input.business_spec, r, input.selected_stack)
              : null,
        };
      }),
    );
  } catch (e) {
    return apiError(e);
  }
}
