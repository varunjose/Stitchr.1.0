import { z } from "zod";
const text = z.string().max(4000);
const items = z.array(z.string().max(300)).max(50);
const count = z.number().finite().nonnegative().max(1e10).nullable();
const flag = z.boolean().nullable();
export const businessSpecSchema = z
  .object({
    business_name: text.nullable(),
    business_type: z.string().min(1).max(120),
    description: text,
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    region: text.nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    business_model: items,
    channels: items,
    expected_usage: z
      .object({
        monthly_users: count,
        monthly_orders: count,
        monthly_transactions: count,
        monthly_messages: count,
        monthly_ai_requests: count,
        monthly_workflow_runs: count,
        monthly_tokens: count,
        monthly_minutes: count,
        linked_accounts: count,
        employees: count,
        locations: count,
      })
      .strict(),
    financials: z
      .object({
        monthly_software_budget: count,
        average_transaction_value: count,
        expected_monthly_revenue: count,
      })
      .strict(),
    existing_tools: items,
    required_features: items,
    excluded_features: items,
    preferences: z
      .object({
        no_code_preferred: flag,
        low_cost_priority: flag,
        scalability_priority: flag,
        easy_setup_priority: flag,
        self_hosting_allowed: flag,
      })
      .strict(),
    constraints: z
      .object({
        strict_no_code: z.boolean(),
        self_host_required: z.boolean(),
        verified_region_required: z.boolean(),
        supported_only: z.boolean(),
        budget_is_hard: z.boolean(),
        api_required: z.boolean(),
        webhooks_required: z.boolean(),
        required_connections: z
          .array(
            z
              .object({
                from: z.string().max(100),
                to: z.string().max(100),
                operation: z.string().max(100).nullable(),
              })
              .strict(),
          )
          .max(30),
      })
      .strict(),
    delivery_model: z.enum([
      "own_drivers",
      "third_party",
      "pickup",
      "none",
      "unknown",
    ]),
    account_model: z.enum(["guest", "accounts", "both", "unknown"]),
    inferred_requirements: items,
    known_requirements: items,
    missing_critical_fields: items,
    clarification_questions: z.array(z.string().max(500)).max(5),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type BusinessSpec = z.infer<typeof businessSpecSchema>;
export function emptySpec(description = ""): BusinessSpec {
  return {
    business_name: null,
    business_type: "unknown",
    description,
    country: null,
    region: null,
    currency: "USD",
    business_model: [],
    channels: [],
    expected_usage: {
      monthly_users: null,
      monthly_orders: null,
      monthly_transactions: null,
      monthly_messages: null,
      monthly_ai_requests: null,
      monthly_workflow_runs: null,
      monthly_tokens: null,
      monthly_minutes: null,
      linked_accounts: null,
      employees: null,
      locations: null,
    },
    financials: {
      monthly_software_budget: null,
      average_transaction_value: null,
      expected_monthly_revenue: null,
    },
    existing_tools: [],
    required_features: [],
    excluded_features: [],
    preferences: {
      no_code_preferred: null,
      low_cost_priority: null,
      scalability_priority: null,
      easy_setup_priority: null,
      self_hosting_allowed: null,
    },
    constraints: {
      strict_no_code: false,
      self_host_required: false,
      verified_region_required: false,
      supported_only: false,
      budget_is_hard: false,
      api_required: false,
      webhooks_required: false,
      required_connections: [],
    },
    delivery_model: "unknown",
    account_model: "unknown",
    inferred_requirements: [],
    known_requirements: [],
    missing_critical_fields: [],
    clarification_questions: [],
    confidence: 0,
  };
}
export const conversationSchema = z
  .object({
    conversation: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().min(1).max(6000),
          })
          .strict(),
      )
      .min(1)
      .max(24),
    existing_partial_spec: businessSpecSchema.nullable().optional(),
  })
  .strict();
export type AnalyzeInput = z.infer<typeof conversationSchema>;
