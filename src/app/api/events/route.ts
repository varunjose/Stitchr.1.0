import { z } from "zod";
import { eventNames, logEvent } from "@/lib/analytics";
import { readBody, apiError } from "@/lib/api";
// Metadata is allowlisted; descriptions, answers, credentials and arbitrary client text are excluded.
const schema = z.object({
  event: z.enum(eventNames),
  metadata: z
    .object({
      step: z.number().int().min(0).max(6).optional(),
      tool_count: z.number().int().max(200).optional(),
      question_count: z.number().int().max(5).optional(),
    })
    .strip(),
});
export async function POST(req: Request) {
  try {
    const x = schema.parse(await readBody(req));
    logEvent(x.event, x.metadata);
    return new Response(null, { status: 204 });
  } catch (e) {
    return apiError(e);
  }
}
