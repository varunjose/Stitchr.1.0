import type { BusinessSpec } from "../requirements/schema";
export type Readiness =
  | "RESEARCHED"
  | "CONFIGURED"
  | "TESTED"
  | "SUPPORTED"
  | "RESTRICTED"
  | "RETIRED";
export type Formula =
  | "fixed"
  | "per_seat"
  | "per_linked_account"
  | "per_transaction"
  | "percentage"
  | "per_message"
  | "per_workflow_run"
  | "per_token"
  | "per_minute"
  | "tiered"
  | "minimum"
  | "unknown";
export interface Rule {
  formula: Formula;
  metric: string;
  unit_price: number | null;
  max_unit_price?: number;
  threshold: number;
  bucket: "fixed" | "variable" | "transaction" | "optional";
  tiers?: { up_to: number | null; unit_price: number }[];
  country?: string;
  note?: string;
}
export interface Plan {
  id: string;
  tool_id: string;
  name: string;
  currency: string;
  billing_period: "monthly" | "annual" | "usage" | "unknown";
  base_price: number | null;
  pricing_type: string;
  included_units: Record<string, number>;
  plan_requirements: string;
  price_status:
    "observed" | "requires_confirmation" | "custom_quote" | "unknown";
  price_text: string;
  rules: Rule[];
  country: string | null;
  production_eligible: boolean | null;
  complete_price: boolean;
}
export interface Tool {
  id: string;
  slug: string;
  name: string;
  vendor: string;
  description: string;
  category: string;
  website_url: string | null;
  logo_url: string | null;
  hosted_or_self_hosted: "hosted" | "self_hosted" | "both" | "unknown";
  integration_route: string;
  status: "discovery" | "supported";
  capabilities: string[];
  readiness: Readiness;
  constraints: string;
  integration_setup: string;
  source_reference: string;
  references: string[];
  last_researched: string;
  regions: { country: string; supported: boolean | null }[];
  limits: {
    metric: string;
    value: number | null;
    plan_id?: string;
    notes: string;
  }[];
  api_support: boolean | null;
  webhook_support: boolean | null;
  business_models: string[];
  plans: Plan[];
}
export interface Connection {
  id: string;
  tool_a_id: string;
  tool_b_id: string;
  connection_type:
    | "native"
    | "middleware"
    | "configured_api"
    | "adapter"
    | "unsupported"
    | "unknown";
  middleware_tool_id: string | null;
  verified: boolean;
  readiness_status: Readiness;
  setup_complexity: number | null;
  supported_direction: "a_to_b" | "b_to_a" | "bidirectional" | "unknown";
  notes: string;
  last_verified_at: string | null;
  source_reference: string;
  authentication_method: string | null;
  required_scopes: string[] | null;
  webhook_support: boolean | null;
  polling_support: boolean | null;
  rate_limits: string | null;
  retry_behavior: string | null;
  idempotency_support: boolean | null;
  known_constraints: string[];
  operations: {
    operation_name: string;
    operation_type: string;
    verified: boolean;
  }[];
  required_plan_ids: string[];
}
export interface Template {
  template_id: string;
  name: string;
  business_types: string[];
  default_capabilities: string[];
  optional_capabilities: string[];
  recommended_stack_pattern: string[];
  tested_connections: string[];
  confidence: number;
  readiness_status: Readiness;
}
export interface Registry {
  version: string;
  researched_at: string;
  tools: Tool[];
  connections: Connection[];
  templates: Template[];
}
export interface Candidate {
  tool: Tool;
  plan: Plan;
  fit_score: number;
  confidence: string;
  why_recommended: string[];
  price_summary: string;
  limitations: string[];
  connection_quality: string;
  dependency_notes: string[];
  verification_warnings: string[];
}
export interface Category {
  capability: string;
  required: boolean;
  selected_tool: string | null;
  recommendations: Candidate[];
}
export type Selection = Record<string, string>;
export interface Pricing {
  assumptions: BusinessSpec["expected_usage"] & BusinessSpec["financials"];
  currency: string;
  fixed_monthly: number;
  variable_estimate: { min: number; max: number };
  transaction_estimate: { min: number; max: number };
  optional_estimate: { min: number; max: number };
  estimated_min: number;
  estimated_max: number | null;
  complete: boolean;
  unknowns: string[];
  lines: {
    tool_id: string;
    name: string;
    min: number;
    max: number;
    currency: string;
    partial: boolean;
  }[];
}
export interface Recommendation {
  selected_tools: Tool[];
  business_spec: BusinessSpec;
  template_match: Template[];
  capabilities: string[];
  categories: Category[];
  pricing: Pricing;
  warnings: string[];
  registry_snapshot_version: string;
  selection: Selection;
  connections: Connection[];
  required_edges: { from: string; to: string; operation: string | null }[];
}
