import { describe, it, expect } from "vitest";
import { catalogRegistry } from "../src/lib/registry/catalog";
import {
  emptySpec,
  businessSpecSchema,
  type BusinessSpec,
} from "../src/lib/requirements/schema";
import { mapCapabilities, matchTemplates } from "../src/lib/stack/capabilities";
import {
  recommend,
  validateStack,
  revalidate,
  optimize,
} from "../src/lib/stack/engine";
import { exclusionReasons } from "../src/lib/stack/constraints";
import { confidence, weightedScore } from "../src/lib/stack/scorer";
import {
  calculatePricing,
  calculateRule,
  choosePlan,
} from "../src/lib/pricing/calculator";
import { affectedTools, validateEdges } from "../src/lib/stack/graph";
import { demoAnalyze } from "../src/lib/requirements/demo";
import type {
  Registry,
  Tool,
  Connection,
  Rule,
} from "../src/lib/registry/types";
const catalog = catalogRegistry();
function spec(type = "cloud kitchen"): BusinessSpec {
  return {
    ...emptySpec(),
    business_type: type,
    country: "US",
    expected_usage: { ...emptySpec().expected_usage, monthly_orders: 1000 },
    financials: { ...emptySpec().financials, average_transaction_value: 35 },
  };
}
const tool = (id: string) =>
  structuredClone(catalog.tools.find((t) => t.id === id)!);
function ready(t: Tool, price = 10) {
  t.readiness = "SUPPORTED";
  t.status = "supported";
  t.api_support = true;
  t.webhook_support = true;
  t.regions = [{ country: "US", supported: true }];
  t.plans = [
    {
      ...t.plans[0],
      id: t.id + "-tested",
      base_price: price,
      currency: "USD",
      country: null,
      billing_period: "monthly",
      complete_price: true,
      production_eligible: true,
      rules: [],
    },
  ];
  return t;
}
function connection(
  a: string,
  b: string,
  status: Connection["connection_type"] = "native",
): Connection {
  return {
    ...catalog.connections[0],
    id: a + "--" + b,
    tool_a_id: a,
    tool_b_id: b,
    connection_type: status,
    verified: true,
    readiness_status: "SUPPORTED",
    supported_direction: "bidirectional",
    notes: "Synthetic test fixture",
    required_plan_ids: [],
  };
}
function testRegistry(tools: Tool[], connections: Connection[] = []): Registry {
  return { ...catalog, tools, connections };
}
describe("catalog provenance", () => {
  it("retains all 156 tools without manufacturing readiness", () => {
    expect(catalog.tools).toHaveLength(156);
    expect(
      catalog.tools.every(
        (t) => t.readiness === "RESEARCHED" && t.status === "discovery",
      ),
    ).toBe(true);
    expect(
      catalog.connections.every(
        (c) => !c.verified && c.operations.length === 0,
      ),
    ).toBe(true);
  });
  it("preserves source references and unknown region/API metadata", () => {
    expect(
      catalog.tools.every(
        (t) => t.source_reference && t.constraints && t.plans[0].price_text,
      ),
    ).toBe(true);
    expect(tool("stripe").regions).toEqual([]);
    expect(tool("stripe").api_support).toBeNull();
  });
  it("does not use India Shopify observation for US pricing", () => {
    expect(tool("shopify").plans[0].currency).toBe("INR");
    expect(choosePlan(tool("shopify"), spec()).base_price).toBeNull();
  });
  it("keeps quotes unknown, not free", () => {
    const p = calculatePricing([tool("weweb")], spec());
    expect(p.complete).toBe(false);
    expect(p.estimated_max).toBeNull();
    expect(p.unknowns.length).toBeGreaterThan(0);
  });
});
describe("business scenarios", () => {
  const cases: [string, string[]][] = [
    ["cloud kitchen", ["online_ordering", "payments", "owner_dashboard"]],
    ["service business", ["website", "booking", "crm"]],
    ["online store", ["product_catalog", "online_ordering"]],
    [
      "consulting client portal",
      ["customer_accounts", "file_storage", "booking"],
    ],
    ["two-sided marketplace", ["marketplace_payments", "product_catalog"]],
    ["ai support application", ["ai_agent", "knowledge_retrieval"]],
    ["saas", ["subscriptions", "database"]],
  ];
  it.each(cases)("%s maps reusable capabilities", (type, expected) => {
    const s = spec(type);
    const caps = mapCapabilities(s, matchTemplates(s, catalog.templates));
    for (const c of expected) expect(caps).toContain(c);
  });
  it("multi-location kitchen preserves unusual needs as gaps", () => {
    const s = spec();
    s.expected_usage.locations = 3;
    s.required_features = ["employee_credits"];
    const r = recommend(s, catalog);
    expect(r.capabilities).toContain("multi_location");
    expect(
      r.categories.find((c) => c.capability === "employee_credits")
        ?.recommendations,
    ).toEqual([]);
  });
  it("existing Stripe and HubSpot are retained", () => {
    const s = spec();
    s.existing_tools = ["Stripe", "HubSpot"];
    const r = recommend(s, catalog);
    expect(Object.values(r.selection)).toContain("stripe");
    expect(Object.values(r.selection)).toContain("hubspot");
  });
  it("unknown country stays unknown and emits warnings", () => {
    const s = spec();
    s.country = null;
    const r = recommend(s, catalog);
    expect(r.business_spec.country).toBeNull();
    expect(r.warnings.join()).toContain("Country is unknown");
  });
  it("low hard budget excludes expensive products", () => {
    const s = spec();
    s.constraints.budget_is_hard = true;
    s.financials.monthly_software_budget = 5;
    expect(
      exclusionReasons(
        ready(tool("stripe"), 10),
        "payments",
        s,
        testRegistry([]),
      ),
    ).toContain("Fixed software budget cannot be met");
  });
  it("hybrid matches several templates and deduplicates capabilities", () => {
    const s = spec("consulting client portal online store");
    const t = matchTemplates(s, catalog.templates),
      caps = mapCapabilities(s, t);
    expect(t.length).toBe(3);
    expect(caps.length).toBe(new Set(caps).size);
  });
  it("explicit capabilities override template exclusions and unusual needs survive", () => {
    const s = spec("online store");
    s.excluded_features = ["payments", "product_catalog"];
    s.required_features = ["payments", "custom_robot_delivery"];
    const c = mapCapabilities(s, matchTemplates(s, catalog.templates));
    expect(c).toContain("payments");
    expect(c).not.toContain("product_catalog");
    expect(c).toContain("custom_robot_delivery");
  });
  it("identical spec and registry return deterministic output", () => {
    expect(recommend(spec(), catalog)).toEqual(recommend(spec(), catalog));
  });
});
describe("hard filtering", () => {
  it.each(["RESTRICTED", "RETIRED"] as const)(
    "rejects %s tools",
    (readiness) => {
      const t = tool("stripe");
      t.readiness = readiness;
      expect(
        exclusionReasons(t, "payments", spec(), catalog).length,
      ).toBeGreaterThan(0);
    },
  );
  it("rejects unsupported country and unknown mandatory availability", () => {
    const t = tool("stripe"),
      s = spec();
    t.regions = [{ country: "US", supported: false }];
    expect(exclusionReasons(t, "payments", s, catalog)).toContain(
      "Country unavailable",
    );
    s.constraints.verified_region_required = true;
    t.regions = [];
    expect(exclusionReasons(t, "payments", s, catalog)).toContain(
      "Country support unverified",
    );
  });
  it("rejects unknown required API and webhook support", () => {
    const s = spec();
    s.constraints.api_required = true;
    s.constraints.webhooks_required = true;
    expect(exclusionReasons(tool("stripe"), "payments", s, catalog)).toEqual(
      expect.arrayContaining([
        "Required API access not verified",
        "Required webhook support not verified",
      ]),
    );
  });
  it("strict no-code does not promote visual research to support", () => {
    const s = spec();
    s.constraints.strict_no_code = true;
    expect(exclusionReasons(tool("stripe"), "payments", s, catalog)).toContain(
      "No tested strict no-code route",
    );
  });
  it("excludes merchant-of-record digital-only payments for a kitchen", () => {
    expect(
      exclusionReasons(tool("paddle"), "payments", spec(), catalog),
    ).toContain("Business model unsupported");
  });
  it("enforces known plan usage limits", () => {
    const t = tool("stripe");
    t.limits = [{ metric: "monthly_orders", value: 500, notes: "Synthetic" }];
    expect(exclusionReasons(t, "payments", spec(), catalog)).toContain(
      "Usage exceeds available plan limit",
    );
  });
  it("required exact integration operation must be verified", () => {
    const s = spec();
    s.constraints.required_connections = [
      { from: "stripe", to: "shopify", operation: "refund_created" },
    ];
    expect(exclusionReasons(tool("stripe"), "payments", s, catalog)).toContain(
      "Required integration not verified",
    );
  });
});
describe("scoring and optimization", () => {
  it("uses configured weights and explicit confidence boundaries", () => {
    expect(
      weightedScore({
        requirement_fit: 100,
        existing_compatibility: 100,
        connection_confidence: 100,
        cost_efficiency: 100,
        setup_simplicity: 100,
        scalability: 100,
        readiness: 100,
      }),
    ).toBe(100);
    expect([59, 60, 74, 75, 89, 90, 100].map(confidence)).toEqual([
      "Weak Match",
      "Viable Alternative",
      "Viable Alternative",
      "Recommended",
      "Recommended",
      "Strong Match",
      "Strong Match",
    ]);
  });
  it("never presents researched tools with supported-level confidence", () => {
    expect(
      recommend(spec(), catalog)
        .categories.flatMap((c) => c.recommendations)
        .every((c) => c.fit_score < 75),
    ).toBe(true);
  });
  it("minimizes redundant tools and charges bundles once", () => {
    const bundled = ready(tool("shopify"));
    bundled.capabilities = ["customer_interface", "database", "authentication"];
    const s = spec("custom");
    s.required_features = bundled.capabilities;
    const r = testRegistry([
      bundled,
      ready(tool("supabase")),
      ready(tool("clerk")),
    ]);
    const selection = optimize(bundled.capabilities, s, r);
    expect(new Set(Object.values(selection)).size).toBe(1);
    expect(calculatePricing([bundled, bundled], s).fixed_monthly).toBe(10);
  });
  it("offers two or more alternatives when valid candidates exist", () => {
    const s = spec("custom");
    s.required_features = ["payments"];
    const r = recommend(
      s,
      testRegistry([ready(tool("stripe")), ready(tool("paypal"))]),
    );
    expect(r.categories[0].recommendations.length).toBe(2);
  });
});
describe("dependency-aware replacement", () => {
  const a = ready(tool("shopify")),
    b = ready(tool("stripe"), 20),
    c = ready(tool("square"), 5),
    analytics = ready(tool("mixpanel"));
  const s = spec("custom");
  s.required_features = ["customer_interface", "payments", "analytics"];
  it("detects incompatible swap and leaves unrelated analytics alone", () => {
    const r = testRegistry(
      [a, b, c, analytics],
      [connection(a.id, b.id), connection(a.id, c.id, "unsupported")],
    );
    const prev = {
        customer_interface: a.id,
        payments: b.id,
        analytics: analytics.id,
      },
      next = { ...prev, payments: c.id };
    const result = revalidate(s, r, prev, next);
    expect(result.affected_capabilities).not.toContain("analytics");
    expect(result.validation.valid).toBe(false);
    expect(
      result.compatibility_changes.some((e) => e.status === "incompatible"),
    ).toBe(true);
    expect(affectedTools(prev, next, r, [b.id, c.id]).has(analytics.id)).toBe(
      false,
    );
  });
  it("swapping to a cheaper compatible tool recalculates cost", () => {
    const r = testRegistry(
      [a, b, c],
      [connection(a.id, b.id), connection(a.id, c.id)],
    );
    const prev = { customer_interface: a.id, payments: b.id },
      next = { ...prev, payments: c.id };
    expect(
      revalidate(s, r, prev, next).updated_pricing.fixed_monthly,
    ).toBeLessThan(calculatePricing([a, b], s).fixed_monthly);
  });
  it("missing connection is unverified, never a fabricated edge", () => {
    const e = validateEdges(
      { customer_interface: a.id, payments: b.id },
      testRegistry([a, b]),
    )[0];
    expect(e.status).toBe("unverified");
    expect(e.connection).toBeNull();
  });
  it("validates direction and required middleware", () => {
    const edge = connection(a.id, b.id);
    edge.supported_direction = "b_to_a";
    expect(
      validateEdges(
        { customer_interface: a.id, payments: b.id },
        testRegistry([a, b], [edge]),
      )[0].status,
    ).toBe("incompatible");
    edge.supported_direction = "bidirectional";
    edge.middleware_tool_id = "make";
    expect(
      validateEdges(
        { customer_interface: a.id, payments: b.id },
        testRegistry([a, b], [edge]),
      )[0].status,
    ).toBe("incompatible");
  });
  it("server validation rejects forged IDs and incomplete capability coverage", () => {
    const r = testRegistry([a, b]);
    const v = validateStack(s, r, { payments: "invented" });
    expect(v.valid).toBe(false);
    expect(v.errors.join()).toContain("choose a valid tool");
  });
  it("server checks retirement after recommendation", () => {
    const r = testRegistry([a, b]);
    r.tools[1].readiness = "RETIRED";
    expect(
      validateStack(s, r, {
        payments: b.id,
        customer_interface: a.id,
      }).errors.join(),
    ).toContain("retired");
  });
});
describe("deterministic pricing", () => {
  it("1000 orders × $35 at 2.9% + 30c = $1315, not $350", () => {
    const p = calculatePricing([tool("stripe")], spec());
    expect(p.transaction_estimate.min).toBe(1315);
    expect(p.estimated_max).toBeNull();
  });
  it("PayPal US checkout fee = $1711.50", () => {
    expect(
      calculatePricing([tool("paypal")], spec()).transaction_estimate.min,
    ).toBe(1711.5);
  });
  it("seats are explicit and not assumed", () => {
    const s = spec();
    expect(calculatePricing([tool("airtable")], s).unknowns.join()).toContain(
      "employees",
    );
    s.expected_usage.employees = 3;
    expect(calculatePricing([tool("airtable")], s).fixed_monthly).toBe(60);
  });
  it("unknown amount is not zero and zero usage is legitimate", () => {
    const rule: Rule = {
      formula: "per_message",
      metric: "monthly_messages",
      unit_price: 0.1,
      threshold: 0,
      bucket: "variable",
    };
    expect(calculateRule(rule, null)).toBeNull();
    expect(calculateRule(rule, 0)).toEqual({ min: 0, max: 0 });
  });
  it.each([
    "per_seat",
    "per_linked_account",
    "per_transaction",
    "percentage",
    "per_message",
    "per_workflow_run",
    "per_token",
    "per_minute",
  ] as const)("calculates %s", (formula) => {
    expect(
      calculateRule(
        {
          formula,
          metric: "test",
          unit_price: 0.5,
          threshold: 10,
          bucket: "variable",
        },
        30,
      ),
    ).toEqual({ min: 10, max: 10 });
  });
  it("calculates usage tiers and minimum spend", () => {
    expect(
      calculateRule(
        {
          formula: "tiered",
          metric: "test",
          unit_price: 0,
          threshold: 0,
          bucket: "variable",
          tiers: [
            { up_to: 100, unit_price: 0.1 },
            { up_to: null, unit_price: 0.05 },
          ],
        },
        200,
      )?.min,
    ).toBe(15);
    expect(
      calculateRule(
        {
          formula: "minimum",
          metric: "revenue",
          unit_price: 0.02,
          threshold: 20,
          bucket: "variable",
        },
        500,
      )?.min,
    ).toBe(20);
  });
  it("supports ranges without pretending unresolved extras are capped", () => {
    const s = spec();
    s.expected_usage.monthly_minutes = 1000;
    const p = calculatePricing([tool("retell-ai")], s);
    expect(p.variable_estimate).toEqual({ min: 70, max: 310 });
    expect(p.estimated_max).toBeNull();
  });
  it("never silently converts currencies", () => {
    expect(calculatePricing([tool("n8n")], spec()).unknowns.join()).toContain(
      "currency",
    );
  });
});
describe("requirements extraction contract", () => {
  it("strictly rejects extra properties, negative usage, and model SQL", () => {
    expect(
      businessSpecSchema.safeParse({ ...spec(), sql: "DROP TABLE tools" })
        .success,
    ).toBe(false);
    const s = spec();
    s.expected_usage.monthly_orders = -1;
    expect(businessSpecSchema.safeParse(s).success).toBe(false);
  });
  it("demo extracts provided facts and does not ask them again", () => {
    const s = demoAnalyze({
      conversation: [
        {
          role: "user",
          content:
            "Cloud kitchen in the US, 1,000 orders, $35 average order, own drivers, one location, guest checkout, $150 software budget.",
        },
      ],
    });
    expect(s.country).toBe("US");
    expect(s.expected_usage.monthly_orders).toBe(1000);
    expect(s.clarification_questions).toEqual([]);
    expect(businessSpecSchema.safeParse(s).success).toBe(true);
  });
  it("asks only material unanswered questions and allows unknowns", () => {
    const s = demoAnalyze({
      conversation: [
        { role: "user", content: "I want a cloud kitchen with 1000 orders" },
      ],
    });
    expect(s.clarification_questions.length).toBeLessThanOrEqual(5);
    expect(s.clarification_questions.join()).not.toContain(
      "Do you need ordering",
    );
    expect(s.clarification_questions.join()).not.toContain("How many orders");
    expect(
      demoAnalyze({
        conversation: [
          {
            role: "user",
            content: "Build a kitchen, proceed with unknown values",
          },
        ],
      }).clarification_questions,
    ).toEqual([]);
  });
});

describe("explicit required integration plans", () => {
  it("accepts verified endpoint plans and blocks a non-selected plan", () => {
    const stripe = ready(tool("stripe"));
    const shopify = ready(tool("shopify"));
    const edge = connection("shopify", "stripe");
    edge.required_plan_ids = [stripe.plans[0].id, shopify.plans[0].id];
    const r = testRegistry([stripe, shopify], [edge]);
    const s = spec("custom");
    s.required_features = ["payments", "customer_interface"];
    s.constraints.required_connections = [
      { from: "Shopify", to: "Stripe", operation: null },
    ];
    expect(exclusionReasons(stripe, "payments", s, r)).toEqual([]);
    expect(
      validateStack(s, r, { payments: "stripe", customer_interface: "shopify" })
        .valid,
    ).toBe(true);
    edge.required_plan_ids = ["stripe-higher-unselected-plan"];
    stripe.plans.push({
      ...stripe.plans[0],
      id: "stripe-higher-unselected-plan",
      base_price: 99,
    });
    expect(
      validateStack(s, r, { payments: "stripe", customer_interface: "shopify" })
        .valid,
    ).toBe(false);
  });
  it("does not silently change a requested notification channel or third-party delivery model", () => {
    const s = spec("custom");
    s.required_features = ["notifications"];
    s.delivery_model = "third_party";
    const caps = mapCapabilities(s, []);
    expect(caps).toContain("notifications");
    expect(caps).not.toContain("transactional_email");
    expect(caps).toContain("third_party_delivery");
  });
});
