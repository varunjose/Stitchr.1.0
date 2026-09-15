import { emptySpec, type AnalyzeInput, type BusinessSpec } from "./schema";
// Opt-in offline demonstration only; never silently substituted for failed AI extraction.
export function demoAnalyze(input: AnalyzeInput): BusinessSpec {
  const text = input.conversation
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  const low = text.toLowerCase();
  const s = input.existing_partial_spec
    ? structuredClone(input.existing_partial_spec)
    : emptySpec(text);
  s.description =
    input.conversation.find((m) => m.role === "user")?.content ?? text;
  const types = [
    ["cloud kitchen", /kitchen|restaurant/],
    ["online store", /online store|ecommerce|e-commerce/],
    ["consulting", /consulting/],
    ["client portal", /portal/],
    ["service business", /salon|cleaning|service business/],
    ["marketplace", /marketplace|two-sided/],
    ["saas", /saas|subscription software/],
    ["ai support", /ai.*support|support.*app/],
    ["ai receptionist", /receptionist|voice agent/],
    ["internal operations", /internal/],
  ] as const;
  const found = types.filter(([, r]) => r.test(low)).map(([name]) => name);
  if (found.length) {
    s.business_type = found.join(" + ");
    s.business_model = found;
  }
  const countries: [RegExp, string][] = [
    [/\b(us|usa|united states)\b/, "US"],
    [/\bindia\b/, "IN"],
    [/\b(uk|united kingdom)\b/, "GB"],
    [/\bcanada\b/, "CA"],
    [/\baustralia\b/, "AU"],
  ];
  for (const [r, c] of countries) if (r.test(low)) s.country = c;
  const num = (r: RegExp) => {
    const m = low.match(r);
    return m ? Number(m[1].replaceAll(",", "")) : null;
  };
  s.expected_usage.monthly_orders =
    num(/([\d,]+)\s*orders/) ?? s.expected_usage.monthly_orders;
  s.expected_usage.locations =
    num(/(\d+)\s*locations?/) ??
    (/one location/.test(low) ? 1 : s.expected_usage.locations);
  s.expected_usage.employees =
    num(/(\d+)\s*(?:employees|admin users|seats)/) ??
    s.expected_usage.employees;
  s.financials.average_transaction_value =
    num(/\$([\d,.]+)\s*average/) ?? s.financials.average_transaction_value;
  s.financials.monthly_software_budget =
    num(/\$([\d,.]+)\s*(?:software |monthly )?budget/) ??
    s.financials.monthly_software_budget;
  if (/own drivers/.test(low)) s.delivery_model = "own_drivers";
  else if (/third.party/.test(low)) s.delivery_model = "third_party";
  else if (/pickup/.test(low)) s.delivery_model = "pickup";
  if (/guest/.test(low)) s.account_model = "guest";
  else if (/customer accounts|login/.test(low)) s.account_model = "accounts";
  for (const name of ["Stripe", "HubSpot", "Shopify", "QuickBooks", "Square"])
    if (
      new RegExp("already (?:use|have) [^.!\\n]*" + name, "i").test(text) &&
      !s.existing_tools.includes(name)
    )
      s.existing_tools.push(name);
  for (const [r, c] of [
    [/sms/, "sms"],
    [/accounting/, "accounting"],
    [/subscriptions/, "subscriptions"],
    [/employee credits|meal credits/, "employee_credits"],
    [/delivery|deliveries/, "delivery"],
    [/shipping/, "shipping"],
    [/analytics/, "analytics"],
  ] as [RegExp, string][])
    if (r.test(low) && !s.required_features.includes(c))
      s.required_features.push(c);
  const questions: [string, string][] = [];
  if (s.business_type === "unknown")
    questions.push([
      "business_type",
      "What will your customers do with your business?",
    ]);
  if (!s.country)
    questions.push([
      "country",
      "Which country will your business primarily operate in?",
    ]);
  if (found.includes("cloud kitchen") && s.delivery_model === "unknown")
    questions.push([
      "delivery_model",
      "Will you use your own drivers, third-party delivery, or pickup?",
    ]);
  if (
    /kitchen|store|marketplace/.test(s.business_type) &&
    s.expected_usage.monthly_orders === null
  )
    questions.push([
      "expected_usage.monthly_orders",
      "How many orders do you expect each month?",
    ]);
  if (
    /kitchen|store|marketplace/.test(s.business_type) &&
    s.financials.average_transaction_value === null
  )
    questions.push([
      "financials.average_transaction_value",
      "What is the average order value? You can leave this unknown.",
    ]);
  if (s.financials.monthly_software_budget === null)
    questions.push([
      "financials.monthly_software_budget",
      "What monthly software budget would you prefer?",
    ]);
  const q = /proceed with unknown/.test(low) ? [] : questions.slice(0, 5);
  s.missing_critical_fields = q.map((x) => x[0]);
  s.clarification_questions = q.map((x) => x[1]);
  s.known_requirements = [s.description];
  s.inferred_requirements = [
    "Capabilities will be mapped from the business type",
  ];
  s.confidence = 0.65;
  return s;
}
