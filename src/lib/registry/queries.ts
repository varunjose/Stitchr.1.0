import type { DB } from "./db";
import type { Registry, Tool, Template, Connection } from "./types";
import type { BusinessSpec } from "../requirements/schema";
import { mapCapabilities, matchTemplates } from "../stack/capabilities";
export async function loadRegistry(
  db: DB,
  spec: BusinessSpec,
): Promise<Registry> {
  const templates = (
    await db.query<Template>(
      `SELECT t.*,COALESCE((SELECT jsonb_agg(capability_id ORDER BY capability_id) FROM template_capabilities WHERE template_id=t.template_id AND required),'[]') AS default_capabilities,COALESCE((SELECT jsonb_agg(capability_id ORDER BY capability_id) FROM template_capabilities WHERE template_id=t.template_id AND NOT required),'[]') AS optional_capabilities FROM stack_templates t ORDER BY t.template_id`,
    )
  ).rows;
  const caps = mapCapabilities(spec, matchTemplates(spec, templates));
  const rows = (
    await db.query<{ tool: Tool }>(
      `SELECT jsonb_build_object(
 'id',t.id,'slug',t.slug,'name',t.name,'vendor',t.vendor,'description',t.description,'category',t.category,'website_url',t.website_url,'logo_url',t.logo_url,'hosted_or_self_hosted',t.hosted_or_self_hosted,'integration_route',t.integration_route,'status',t.status,'constraints',t.constraints,'integration_setup',t.integration_setup,'source_reference',t.source_reference,'references',t.references_json,'last_researched',t.last_researched,'api_support',t.api_support,'webhook_support',t.webhook_support,'business_models',t.business_models,'readiness',rd.readiness_status,
 'capabilities',(SELECT jsonb_agg(capability_id ORDER BY capability_id) FROM tool_capabilities WHERE tool_id=t.id),
 'regions',COALESCE((SELECT jsonb_agg(jsonb_build_object('country',country,'supported',supported)) FROM tool_regions WHERE tool_id=t.id),'[]'),
 'limits',COALESCE((SELECT jsonb_agg(to_jsonb(l)-'tool_id'-'id') FROM tool_limits l WHERE tool_id=t.id),'[]'),
 'plans',COALESCE((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('rules',COALESCE((SELECT jsonb_agg(metadata ORDER BY id) FROM pricing_rules WHERE tool_plan_id=p.id),'[]')) ORDER BY p.id) FROM tool_plans p WHERE tool_id=t.id),'[]')) AS tool
 FROM tools t JOIN tool_readiness rd ON rd.tool_id=t.id
 WHERE (EXISTS(SELECT 1 FROM tool_capabilities tc WHERE tc.tool_id=t.id AND tc.capability_id=ANY($1::text[])) OR lower(t.name)=ANY($2::text[]) OR t.id=ANY($2::text[]))
 AND rd.readiness_status NOT IN ('RETIRED','RESTRICTED')
 AND NOT EXISTS(SELECT 1 FROM tool_regions r WHERE r.tool_id=t.id AND r.country=$3 AND r.supported=false)
 AND (NOT $4::boolean OR EXISTS(SELECT 1 FROM tool_regions r WHERE r.tool_id=t.id AND r.country=$3 AND r.supported=true))
 AND (NOT $5::boolean OR rd.readiness_status='SUPPORTED')
 AND (NOT $6::boolean OR (t.integration_route='Visual' AND rd.readiness_status='SUPPORTED'))
 AND (NOT $7::boolean OR t.hosted_or_self_hosted IN ('self_hosted','both'))
 AND (NOT $8::boolean OR t.api_support=true)
 AND (NOT $9::boolean OR t.webhook_support=true)
 AND (NOT $10::boolean OR EXISTS(SELECT 1 FROM tool_plans p WHERE p.tool_id=t.id AND p.currency=$11 AND (p.country IS NULL OR p.country=$3) AND p.complete_price=true AND p.base_price IS NOT NULL AND p.base_price<=$12 AND p.production_eligible IS DISTINCT FROM false))
 ORDER BY t.id`,
      [
        caps,
        spec.existing_tools.map((s) => s.toLowerCase()),
        spec.country,
        spec.constraints.verified_region_required,
        spec.constraints.supported_only,
        spec.constraints.strict_no_code,
        spec.constraints.self_host_required,
        spec.constraints.api_required,
        spec.constraints.webhooks_required,
        spec.constraints.budget_is_hard,
        spec.currency,
        spec.financials.monthly_software_budget ?? 0,
      ],
    )
  ).rows;
  const tools = rows.map((r) => r.tool);
  const ids = tools.map((t) => t.id);
  const connections = (
    await db.query<Connection>(
      `SELECT c.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('operation_name',operation_name,'operation_type',operation_type,'verified',verified) ORDER BY operation_name) FROM connection_operations WHERE connection_id=c.id),'[]') AS operations FROM tool_connections c WHERE tool_a_id=ANY($1::text[]) OR tool_b_id=ANY($1::text[]) ORDER BY c.id`,
      [ids],
    )
  ).rows;
  const meta = (
    await db.query<{ version: string; researched_at: string }>(
      `SELECT r.version::text || ':' || s.sha256 AS version,to_char(s.researched_at,'YYYY-MM-DD') AS researched_at FROM registry_revision r CROSS JOIN registry_sources s ORDER BY s.researched_at DESC LIMIT 1`,
    )
  ).rows[0];
  if (!meta) throw new Error("REGISTRY_UNAVAILABLE");
  return {
    version: meta.version,
    researched_at: meta.researched_at,
    tools,
    connections,
    templates,
  };
}
