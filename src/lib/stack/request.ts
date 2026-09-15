import { z } from "zod";
import { businessSpecSchema } from "../requirements/schema";
export const selectionSchema = z
  .record(z.string().max(150), z.string().max(150))
  .refine((s) => Object.keys(s).length <= 80);
export const stackInput = z
  .object({
    business_spec: businessSpecSchema,
    selected_stack: selectionSchema,
    registry_snapshot_version: z.string().max(200),
    acknowledge_uncertainty: z.boolean().optional(),
  })
  .strict();
