import type { BusinessSpec } from "../requirements/schema";
import type { Template } from "../registry/types";
export const capabilityNames = [
  "customer_interface",
  "website",
  "mobile_app",
  "authentication",
  "customer_accounts",
  "product_catalog",
  "online_ordering",
  "order_management",
  "payments",
  "subscriptions",
  "marketplace_payments",
  "database",
  "backend",
  "crm",
  "booking",
  "calendar",
  "delivery",
  "shipping",
  "inventory",
  "accounting",
  "invoicing",
  "email_marketing",
  "transactional_email",
  "notifications",
  "sms",
  "whatsapp",
  "voice",
  "customer_support",
  "analytics",
  "ai_agent",
  "knowledge_retrieval",
  "forms",
  "file_storage",
  "electronic_signature",
  "owner_dashboard",
  "workflow_automation",
  "monitoring",
  "hosting",
  "embedded_integrations",
  "organizations",
  "employee_credits",
  "multi_location",
  "project_management",
  "hr",
];
export const label = (s: string) =>
  s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const alias: Record<string, string> = {
  ordering: "online_ordering",
  "online payments": "payments",
  "online ordering": "online_ordering",
  "tracking deliveries": "delivery",
  "delivery tracking": "delivery",
  dashboard: "owner_dashboard",
  login: "authentication",
  accounts: "customer_accounts",
  "email notifications": "transactional_email",
  "text messages": "sms",
  "multi-location": "multi_location",
};
export function normalizeCapability(s: string) {
  return (
    alias[s.toLowerCase()] ?? s.toLowerCase().trim().replace(/[ -]+/g, "_")
  );
}
export function matchTemplates(spec: BusinessSpec, templates: Template[]) {
  const content = [spec.business_type, ...spec.business_model]
    .join(" ")
    .toLowerCase();
  return templates
    .filter((t) => t.business_types.some((b) => content.includes(b)))
    .sort((a, b) => a.template_id.localeCompare(b.template_id));
}
export function mapCapabilities(spec: BusinessSpec, matched: Template[]) {
  const explicit = spec.required_features.map(normalizeCapability);
  const excluded = new Set(spec.excluded_features.map(normalizeCapability));
  const caps = new Set([
    ...matched
      .flatMap((t) => t.default_capabilities)
      .filter((c) => !excluded.has(c)),
    ...explicit,
  ]);
  if (spec.delivery_model === "own_drivers") caps.add("delivery");
  if (spec.delivery_model === "third_party") caps.add("third_party_delivery");
  if (spec.account_model === "accounts" || spec.account_model === "both")
    caps.add("customer_accounts");
  if ((spec.expected_usage.locations ?? 1) > 1) caps.add("multi_location");
  if (!caps.size) caps.add("customer_interface");
  return [...caps].sort();
}
// Architecture relationships express business data flow, not a claim that vendors connect.
export const capabilityEdges: [string, string][] = [
  ["customer_interface", "product_catalog"],
  ["customer_interface", "online_ordering"],
  ["online_ordering", "order_management"],
  ["online_ordering", "payments"],
  ["payments", "order_management"],
  ["payments", "subscriptions"],
  ["owner_dashboard", "order_management"],
  ["owner_dashboard", "crm"],
  ["owner_dashboard", "backend"],
  ["customer_interface", "payments"],
  ["customer_interface", "marketplace_payments"],
  ["customer_interface", "subscriptions"],
  ["customer_interface", "database"],
  ["customer_interface", "backend"],
  ["customer_interface", "authentication"],
  ["customer_interface", "customer_accounts"],
  ["customer_interface", "file_storage"],
  ["customer_interface", "ai_agent"],
  ["website", "booking"],
  ["website", "crm"],
  ["booking", "payments"],
  ["booking", "calendar"],
  ["order_management", "delivery"],
  ["order_management", "shipping"],
  ["order_management", "inventory"],
  ["order_management", "accounting"],
  ["payments", "accounting"],
  ["order_management", "transactional_email"],
  ["ai_agent", "knowledge_retrieval"],
  ["ai_agent", "customer_support"],
  ["voice", "ai_agent"],
  ["voice", "booking"],
  ["voice", "crm"],
  ["owner_dashboard", "database"],
  ["workflow_automation", "database"],
];
