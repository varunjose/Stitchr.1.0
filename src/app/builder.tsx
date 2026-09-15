"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Plus,
  Undo2,
  Redo2,
  RotateCcw,
  X,
  ChevronDown,
  CheckCheck,
  Link2,
  AlertCircle,
  Layers3,
  ShoppingBag,
  Utensils,
  BriefcaseBusiness,
  PanelsTopLeft,
  ShieldCheck,
  SlidersHorizontal,
  LoaderCircle,
  Download,
  GitCompareArrows,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import {
  businessSpecSchema,
  type BusinessSpec,
} from "@/lib/requirements/schema";
import type {
  Candidate,
  Category,
  Recommendation,
  Selection,
  Tool,
  Registry,
  Pricing,
} from "@/lib/registry/types";
import { calculatePricing, money } from "@/lib/pricing/calculator";
import { label } from "@/lib/stack/capabilities";
import { validateEdges } from "@/lib/stack/graph";
import { track } from "@/lib/analytics";
import type { validateStack } from "@/lib/stack/engine";
type Validation = ReturnType<typeof validateStack>;
type Confirmed = Validation & {
  id: string;
  confirmed_at: string;
  registry_snapshot_version: string;
  validated_stack: Selection;
};
type Snapshot = { selection: Selection; spec: BusinessSpec };
const suggestions = [
  {
    name: "Cloud kitchen",
    icon: Utensils,
    text: "I want to start a cloud kitchen where customers can order online, pay online, and track deliveries. I expect around 1,000 orders per month.",
  },
  {
    name: "Client portal",
    icon: PanelsTopLeft,
    text: "I want to build a client portal for my consulting business where clients can sign in, share documents, and submit requests.",
  },
  {
    name: "Service business",
    icon: BriefcaseBusiness,
    text: "I am launching a local service business. Customers should book appointments and pay online.",
  },
  {
    name: "Online store",
    icon: ShoppingBag,
    text: "I want to start an online store selling physical products with online payments and shipping.",
  },
];
async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const e = new Error(
      data.error ??
        data.errors?.join("; ") ??
        "Please review your choices and retry.",
    ) as Error & { data: unknown };
    e.data = data;
    throw e;
  }
  return data;
}
function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 5v11c0 7 18-7 18 0v11M16 3v26M3 11h26M3 21h26"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ToolMark({ tool }: { tool: Tool }) {
  return (
    <span
      className={"tool-mark tint-" + (tool.id.charCodeAt(0) % 5)}
      aria-hidden="true"
    >
      {tool.name
        .split(" ")
        .map((x) => x[0])
        .join("")
        .slice(0, 2)}
    </span>
  );
}
function StitchVisual() {
  return (
    <div className="stitch-visual" aria-hidden="true">
      <svg viewBox="0 0 650 190">
        <path
          className="thread"
          d="M55 104C135 104 116 44 205 44S270 147 337 147 396 62 473 62 520 108 595 108"
        />
        <path
          className="thread trace"
          d="M55 104C135 104 116 44 205 44S270 147 337 147 396 62 473 62 520 108 595 108"
        />
      </svg>
      <span className="visual-node node-a">
        <ShoppingBag size={23} />
      </span>
      <span className="visual-node node-b">
        <Link2 size={23} />
      </span>
      <span className="visual-node node-c">
        <Layers3 size={23} />
      </span>
      <span className="visual-node node-d">
        <CheckCheck size={23} />
      </span>
    </div>
  );
}
function PriceSummary({ pricing }: { pricing: Pricing }) {
  return (
    <div className="price-breakdown">
      <div>
        <span>Fixed software</span>
        <b>{money(pricing.fixed_monthly, pricing.currency)}</b>
      </div>
      <div>
        <span>Usage estimate</span>
        <b>
          {money(pricing.variable_estimate.min, pricing.currency)}
          {pricing.variable_estimate.max !== pricing.variable_estimate.min
            ? "–" + money(pricing.variable_estimate.max, pricing.currency)
            : ""}
        </b>
      </div>
      <div>
        <span>Transactions</span>
        <b>{money(pricing.transaction_estimate.min, pricing.currency)}</b>
      </div>
      {pricing.optional_estimate.max > 0 && (
        <div>
          <span>Optional costs</span>
          <b>{money(pricing.optional_estimate.min, pricing.currency)}</b>
        </div>
      )}
      <div className="price-total">
        <span>
          {pricing.complete
            ? "Estimated monthly total"
            : "Known monthly subtotal"}
        </span>
        <strong>
          {money(pricing.estimated_min, pricing.currency)}
          {pricing.estimated_max !== null &&
          pricing.estimated_max !== pricing.estimated_min
            ? "–" + money(pricing.estimated_max, pricing.currency)
            : ""}
        </strong>
      </div>
      {!pricing.complete && (
        <p className="price-note">
          <AlertCircle size={14} /> Additional costs are unresolved. This is not
          a complete quote.
        </p>
      )}
    </div>
  );
}
function NumericInput({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <label className="field">
      <span>{name}</span>
      <input
        type="number"
        min="0"
        step="any"
        value={value ?? ""}
        placeholder="Unknown"
        onChange={(e) => {
          const n = e.target.value === "" ? null : Number(e.target.value);
          if (n === null || (Number.isFinite(n) && n >= 0)) onChange(n);
        }}
      />
    </label>
  );
}
function RequirementsEditor({
  spec,
  onChange,
}: {
  spec: BusinessSpec;
  onChange: (s: BusinessSpec) => void;
}) {
  return (
    <div className="editor">
      <label className="field full">
        <span>Your business</span>
        <textarea
          value={spec.description}
          onChange={(e) => onChange({ ...spec, description: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Business type</span>
        <input
          value={spec.business_type}
          onChange={(e) => onChange({ ...spec, business_type: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Operating country (2-letter code)</span>
        <input
          maxLength={2}
          placeholder="Unknown"
          value={spec.country ?? ""}
          onChange={(e) =>
            onChange({ ...spec, country: e.target.value.toUpperCase() || null })
          }
        />
      </label>
      <label className="field">
        <span>Estimate currency</span>
        <select
          value={spec.currency}
          onChange={(e) => onChange({ ...spec, currency: e.target.value })}
        >
          {["USD", "EUR", "GBP", "INR", "CAD", "AUD"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Delivery</span>
        <select
          value={spec.delivery_model}
          onChange={(e) =>
            onChange({
              ...spec,
              delivery_model: e.target.value as BusinessSpec["delivery_model"],
            })
          }
        >
          {["unknown", "own_drivers", "third_party", "pickup", "none"].map(
            (x) => (
              <option key={x} value={x}>
                {label(x)}
              </option>
            ),
          )}
        </select>
      </label>
      <label className="field">
        <span>Customer access</span>
        <select
          value={spec.account_model}
          onChange={(e) =>
            onChange({
              ...spec,
              account_model: e.target.value as BusinessSpec["account_model"],
            })
          }
        >
          {["unknown", "guest", "accounts", "both"].map((x) => (
            <option key={x} value={x}>
              {label(x)}
            </option>
          ))}
        </select>
      </label>
      <NumericInput
        name="Locations"
        value={spec.expected_usage.locations}
        onChange={(n) =>
          onChange({
            ...spec,
            expected_usage: { ...spec.expected_usage, locations: n },
          })
        }
      />
      <NumericInput
        name="Orders per month"
        value={spec.expected_usage.monthly_orders}
        onChange={(n) =>
          onChange({
            ...spec,
            expected_usage: { ...spec.expected_usage, monthly_orders: n },
          })
        }
      />
      <NumericInput
        name="Average transaction value"
        value={spec.financials.average_transaction_value}
        onChange={(n) =>
          onChange({
            ...spec,
            financials: { ...spec.financials, average_transaction_value: n },
          })
        }
      />
      <NumericInput
        name="Preferred monthly software budget"
        value={spec.financials.monthly_software_budget}
        onChange={(n) =>
          onChange({
            ...spec,
            financials: { ...spec.financials, monthly_software_budget: n },
          })
        }
      />
      {(
        [
          "existing_tools",
          "required_features",
          "excluded_features",
          "business_model",
        ] as const
      ).map((key) => (
        <label className="field" key={key}>
          <span>{label(key)} (comma separated)</span>
          <input
            value={spec[key].join(", ")}
            onChange={(e) =>
              onChange({
                ...spec,
                [key]: e.target.value
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
      ))}
      <details className="full">
        <summary>Advanced requirements</summary>
        <div className="checks">
          {Object.entries(spec.constraints)
            .filter(([key]) => key !== "required_connections")
            .map(([key, value]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(e) =>
                    onChange({
                      ...spec,
                      constraints: {
                        ...spec.constraints,
                        [key]: e.target.checked,
                      },
                    })
                  }
                />
                {label(key)}
              </label>
            ))}
        </div>
        <p className="muted small">
          Hard requirements exclude tools when supporting evidence is missing.
          Catalog research alone does not satisfy a verified or supported
          constraint.
        </p>
      </details>
    </div>
  );
}
function Compare({
  category,
  onClose,
  onSelect,
}: {
  category: Category;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const [ids, setIds] = useState(
    category.recommendations.slice(0, 2).map((c) => c.tool.id),
  );
  const candidates = ids
    .map((id) => category.recommendations.find((c) => c.tool.id === id)!)
    .filter(Boolean);
  const modal = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    modal.current?.showModal();
    return () => modal.current?.close();
  }, []);
  const rows: [string, (c: Candidate) => string][] = [
    ["Price", (c) => c.price_summary],
    ["Best for", (c) => c.tool.description],
    ["Capabilities", (c) => c.tool.capabilities.map(label).join(", ")],
    ["Integration quality", (c) => c.connection_quality],
    ["Required plan", (c) => c.plan.name + " · " + c.plan.plan_requirements],
    [
      "Usage limits",
      (c) =>
        c.tool.limits
          .map((l) =>
            l.value === null ? "Needs verification" : `${l.metric}: ${l.value}`,
          )
          .join(", "),
    ],
    ["Setup route", (c) => c.tool.integration_route],
    ["Confidence", (c) => `${c.fit_score}% · ${c.confidence}`],
  ];
  return (
    <dialog
      ref={modal}
      className="compare-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === modal.current) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <span className="eyebrow">A CLOSER LOOK</span>
          <h2>Compare {label(category.capability).toLowerCase()}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close comparison"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <div className="compare-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">What matters</th>
              {candidates.map((c, i) => (
                <th key={i} scope="col">
                  <select
                    aria-label={"Comparison tool " + (i + 1)}
                    value={c.tool.id}
                    onChange={(e) =>
                      setIds(ids.map((v, j) => (j === i ? e.target.value : v)))
                    }
                  >
                    {category.recommendations.map((t) => (
                      <option key={t.tool.id} value={t.tool.id}>
                        {t.tool.name}
                      </option>
                    ))}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, fn]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                {candidates.map((c, i) => (
                  <td key={i}>{fn(c)}</td>
                ))}
              </tr>
            ))}
            <tr>
              <td />
              {candidates.map((c, i) => (
                <td key={i}>
                  <button
                    className="primary"
                    onClick={() => {
                      onSelect(c.tool.id);
                      onClose();
                    }}
                  >
                    Select {c.tool.name}
                    <ArrowRight size={16} />
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </dialog>
  );
}
export default function Builder({ demo }: { demo: boolean }) {
  const [step, setStep] = useState(0),
    [idea, setIdea] = useState(""),
    [answer, setAnswer] = useState(""),
    [conversation, setConversation] = useState<
      { role: "user" | "assistant"; content: string }[]
    >([]),
    [spec, setSpec] = useState<BusinessSpec | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
    [result, setResult] = useState<Recommendation | null>(null),
    [history, setHistory] = useState<Snapshot[]>([]),
    [cursor, setCursor] = useState(0),
    [checking, setChecking] = useState(false),
    [serverValid, setServerValid] = useState<Validation | null>(null),
    [compare, setCompare] = useState<Category | null>(null),
    [assumptions, setAssumptions] = useState(false),
    [expanded, setExpanded] = useState<string[]>([]),
    [ack, setAck] = useState(false),
    [confirmed, setConfirmed] = useState<Confirmed | null>(null),
    [review, setReview] = useState(false);
  const toolCache = useRef(new Map<string, Tool>());
  const requestVersion = useRef(0),
    heading = useRef<HTMLHeadingElement>(null),
    stepRef = useRef(step);
  useEffect(() => {
    track("onboarding_started");
    const drop = () => track("drop_off", { step: stepRef.current });
    window.addEventListener("pagehide", drop);
    return () => window.removeEventListener("pagehide", drop);
  }, []);
  useEffect(() => {
    stepRef.current = step;
    heading.current?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);
  const snap = history[cursor],
    currentSpec = snap?.spec ?? spec,
    selection = snap?.selection ?? {};
  const allTools = useMemo(() => {
    for (const t of result?.selected_tools ?? [])
      toolCache.current.set(t.id, t);
    for (const c of result?.categories ?? [])
      for (const r of c.recommendations)
        toolCache.current.set(r.tool.id, r.tool);
    return [...toolCache.current.values()];
  }, [result]);
  const tools = allTools.filter((t) => Object.values(selection).includes(t.id));
  const price = currentSpec ? calculatePricing(tools, currentSpec) : null;
  const localRegistry: Registry = {
    version: result?.registry_snapshot_version ?? "",
    researched_at: "2026-09-10",
    tools: allTools,
    templates: result?.template_match ?? [],
    connections: result?.connections ?? [],
  };
  const edges = validateEdges(
    selection,
    localRegistry,
    currentSpec?.constraints.required_connections ?? [],
  );
  const missing = result?.capabilities.filter((c) => !selection[c]) ?? [];
  async function analyze(content: string) {
    const next = [...conversation, { role: "user" as const, content }];
    setBusy(true);
    setError("");
    track(
      step === 0 ? "business_description_submitted" : "clarification_answered",
    );
    try {
      const data = await api<{
        business_spec: BusinessSpec;
        complete: boolean;
      }>("/api/onboarding/analyze", {
        conversation: next,
        existing_partial_spec: spec,
      });
      setConversation([
        ...next,
        ...(data.business_spec.clarification_questions.length
          ? [
              {
                role: "assistant" as const,
                content: data.business_spec.clarification_questions.join("\n"),
              },
            ]
          : []),
      ]);
      setSpec(data.business_spec);
      setAnswer("");
      setStep(data.complete ? 2 : 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (!spec) return;
    const valid = businessSpecSchema.safeParse(spec);
    if (!valid.success) {
      setError("Please check your country code and numeric requirements.");
      return;
    }
    setBusy(true);
    setError("");
    setStep(3);
    track("requirements_confirmed");
    try {
      const data = await api<Recommendation>("/api/stacks/recommend", spec);
      setResult(data);
      setHistory([{ selection: data.selection, spec }]);
      setCursor(0);
      setServerValid(null);
      setStep(4);
      await validate({ selection: data.selection, spec }, data.selection, data);
    } catch (e) {
      setError((e as Error).message);
      setStep(2);
    } finally {
      setBusy(false);
    }
  }
  async function validate(
    next: Snapshot,
    previous: Selection,
    source = result,
  ) {
    if (!source) return;
    const version = ++requestVersion.current;
    setChecking(true);
    setAck(false);
    setServerValid(null);
    try {
      const data = await api<{
        replacement_recommendations: Category[];
        updated_pricing: Pricing;
        validation: Validation;
        registry_snapshot_version: string;
        refreshed_recommendation: Recommendation | null;
      }>("/api/stacks/revalidate", {
        business_spec: next.spec,
        selected_stack: next.selection,
        previous_stack: previous,
        registry_snapshot_version: source.registry_snapshot_version,
      });
      if (version !== requestVersion.current) return;
      setServerValid(data.validation);
      setResult(
        (old) =>
          data.refreshed_recommendation ??
          (old
            ? {
                ...old,
                registry_snapshot_version: data.registry_snapshot_version,
                categories: old.categories.map(
                  (c) =>
                    data.replacement_recommendations.find(
                      (n) => n.capability === c.capability,
                    ) ?? c,
                ),
              }
            : old),
      );
      if (data.validation.warnings.length) track("compatibility_warning_shown");
    } catch (e) {
      if (version === requestVersion.current) setError((e as Error).message);
    } finally {
      if (version === requestVersion.current) setChecking(false);
    }
  }
  function change(next: Snapshot) {
    const h = [...history.slice(0, cursor + 1), structuredClone(next)];
    setHistory(h);
    setCursor(h.length - 1);
    setError("");
    void validate(next, selection);
  }
  function select(cap: string, id: string) {
    if (!currentSpec) return;
    track("tool_changed");
    change({ spec: currentSpec, selection: { ...selection, [cap]: id } });
  }
  function move(index: number) {
    if (index < 0 || index >= history.length) return;
    setCursor(index);
    setError("");
    void validate(history[index], selection);
  }
  function changeAssumption(next: BusinessSpec) {
    track("price_assumption_changed");
    change({ spec: next, selection });
  }
  async function confirm() {
    if (!currentSpec || !result) return;
    setBusy(true);
    setError("");
    try {
      const data = await api<Confirmed>("/api/stacks/confirm", {
        business_spec: currentSpec,
        selected_stack: selection,
        registry_snapshot_version: result.registry_snapshot_version,
        acknowledge_uncertainty: ack,
      });
      setConfirmed(data);
      setStep(5);
    } catch (e) {
      const data = (e as Error & { data?: { code?: string } }).data;
      setError((e as Error).message);
      if (data?.code === "REGISTRY_CHANGED")
        await validate({ spec: currentSpec, selection }, selection);
    } finally {
      setBusy(false);
    }
  }
  function exportStack() {
    if (!confirmed || !currentSpec) return;
    const blob = new Blob(
      [JSON.stringify({ business_spec: currentSpec, ...confirmed }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "stitchr-business-stack.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="header">
        <a href="/" className="wordmark" aria-label="Stitchr home">
          stitchr
          <span>
            <Mark />
          </span>
        </a>
        <div className="header-progress">
          <span className={step < 3 ? "active" : ""}>
            01 <b>Your business</b>
          </span>
          <i />
          <span className={step >= 3 && step < 5 ? "active" : ""}>
            02 <b>Your tools</b>
          </span>
          <i />
          <span className={step === 5 ? "active" : ""}>
            03 <b>Your stack</b>
          </span>
        </div>
        <a
          className="header-link"
          href="https://stitchr.studio/"
          target="_blank"
          rel="noreferrer"
        >
          About Stitchr <ExternalLink size={13} />
        </a>
      </header>
      {demo && (
        <div className="demo-banner">
          Local demo · Uses a limited sample interpreter. Production
          requirements extraction uses OpenAI.
        </div>
      )}
      <main id="main" className={step === 4 ? "main wide" : "main"}>
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {step === 0 && (
          <section className="intro animate-in">
            <div className="eyebrow">
              <span className="dot" /> FROM IDEA TO YOUR BUSINESS STACK
            </div>
            <h1 ref={heading} tabIndex={-1}>
              What are you
              <br />
              <em>building?</em>
            </h1>
            <p className="intro-copy">
              Tell us about your business. We’ll find the tools
              <br className="desktop" /> that fit, and help you make them your
              own.
            </p>
            <form
              className="idea-box"
              onSubmit={(e) => {
                e.preventDefault();
                if (idea.trim()) void analyze(idea);
              }}
            >
              <label className="sr-only" htmlFor="idea">
                What are you building?
              </label>
              <textarea
                id="idea"
                placeholder="I’m starting a business that…"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                maxLength={4000}
                required
              />
              <div className="idea-bottom">
                <span>
                  <Sparkles size={14} /> Your idea is the starting point.
                </span>
                <button className="primary" disabled={busy || !idea.trim()}>
                  {busy ? (
                    <>
                      <LoaderCircle className="spin" size={16} />
                      Understanding…
                    </>
                  ) : (
                    <>
                      Find my stack
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>
              </div>
            </form>
            <div className="suggestions">
              <span>Or start with an idea</span>
              <div>
                {suggestions.map((s) => (
                  <button key={s.name} onClick={() => setIdea(s.text)}>
                    <s.icon size={15} />
                    {s.name}
                    <Plus size={13} />
                  </button>
                ))}
              </div>
            </div>
            <StitchVisual />
            <div className="intro-footer">
              <span>
                <Layers3 size={15} /> 156 researched tools
              </span>
              <span>
                <ShieldCheck size={15} /> Clear costs. Honest recommendations.
              </span>
              <span>
                <Link2 size={15} /> Your tools, thoughtfully connected.
              </span>
            </div>
          </section>
        )}
        {step === 1 && spec && (
          <section className="conversation animate-in">
            <button className="text-button" onClick={() => setStep(0)}>
              <ArrowLeft size={15} />
              Your idea
            </button>
            <span className="eyebrow">A LITTLE CONTEXT GOES A LONG WAY</span>
            <h1 ref={heading} tabIndex={-1}>
              Let’s get the
              <br />
              <em>important details.</em>
            </h1>
            <p className="muted">
              Just what we need to find tools that work for your business.
            </p>
            <div className="idea-quote">{spec.description}</div>
            <div className="question-list">
              {spec.clarification_questions.map((q, i) => (
                <div key={q}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <p>{q}</p>
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (answer.trim()) void analyze(answer);
              }}
            >
              <label className="sr-only" htmlFor="answer">
                Your answers
              </label>
              <textarea
                id="answer"
                placeholder="Answer in your own words. It’s okay if some things are undecided."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                maxLength={6000}
              />
              <div className="form-actions">
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setSpec({
                      ...spec,
                      clarification_questions: [],
                      missing_critical_fields: [],
                    });
                    setStep(2);
                  }}
                >
                  Keep unknowns and continue
                </button>
                <button className="primary" disabled={busy || !answer.trim()}>
                  {busy ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <>
                      Continue
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        )}
        {step === 2 && spec && (
          <section className="requirements animate-in">
            <span className="eyebrow">YOUR BUSINESS, UNDERSTOOD</span>
            <h1 ref={heading} tabIndex={-1}>
              Here’s the
              <br />
              <em>big picture.</em>
            </h1>
            <p className="muted">
              Check the details before we find your tools.
            </p>
            <div className="requirement-card">
              <div className="section-heading">
                <div>
                  <span className="icon-tile">
                    <BriefcaseBusiness size={22} />
                  </span>
                  <h2>{label(spec.business_type)}</h2>
                </div>
                <button
                  className="text-button"
                  onClick={() => setEditing(!editing)}
                >
                  <SlidersHorizontal size={15} />
                  {editing ? "Done editing" : "Edit details"}
                </button>
              </div>
              {editing ? (
                <RequirementsEditor spec={spec} onChange={setSpec} />
              ) : (
                <>
                  <p className="description">{spec.description}</p>
                  <div className="fact-grid">
                    <div>
                      <span>OPERATING IN</span>
                      <b>{spec.country ?? "Country undecided"}</b>
                    </div>
                    <div>
                      <span>MONTHLY ORDERS</span>
                      <b>
                        {spec.expected_usage.monthly_orders?.toLocaleString() ??
                          "Not estimated"}
                      </b>
                    </div>
                    <div>
                      <span>SOFTWARE BUDGET</span>
                      <b>
                        {spec.financials.monthly_software_budget !== null
                          ? money(
                              spec.financials.monthly_software_budget,
                              spec.currency,
                            )
                          : "Flexible / unknown"}
                      </b>
                    </div>
                    <div>
                      <span>DELIVERY</span>
                      <b>{label(spec.delivery_model)}</b>
                    </div>
                  </div>
                  {spec.required_features.length > 0 && (
                    <div className="chips">
                      {spec.required_features.map((c) => (
                        <span key={c}>{label(c)}</span>
                      ))}
                    </div>
                  )}
                  <details>
                    <summary>Facts and inferences</summary>
                    <p className="small">
                      Known:{" "}
                      {spec.known_requirements.join(" · ") ||
                        "No additional facts"}
                    </p>
                    <p className="small muted">
                      Inferred:{" "}
                      {spec.inferred_requirements.join(" · ") || "None"}
                    </p>
                  </details>
                </>
              )}
            </div>
            <div className="form-actions">
              <button className="text-button" onClick={() => setStep(1)}>
                <ArrowLeft size={16} />
                Add context
              </button>
              <button className="primary" onClick={generate}>
                Looks good. Find my tools
                <ArrowRight size={17} />
              </button>
            </div>
          </section>
        )}
        {step === 3 && (
          <section className="loading-state">
            <span className="loading-mark">
              <Mark size={48} />
            </span>
            <h1 ref={heading} tabIndex={-1}>
              Finding your
              <br />
              <em>starting stack.</em>
            </h1>
            <p className="muted">Matching your needs with the tool registry.</p>
            <div className="loading-stages">
              <span>
                <Check size={16} />
                Requirements understood
              </span>
              <span>
                <LoaderCircle className="spin" size={16} />
                Finding tools, checking connections and pricing
              </span>
            </div>
          </section>
        )}
        {step === 4 && result && currentSpec && price && (
          <section className="selection-page animate-in">
            <div className="selection-heading">
              <div>
                <span className="eyebrow">A STACK THAT STARTS WITH YOU</span>
                <h1 ref={heading} tabIndex={-1}>
                  Your tools.<em> Your choice.</em>
                </h1>
                <p className="muted">
                  A considered starting point for your{" "}
                  {currentSpec.business_type}. Compare, swap, make it yours.
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => {
                  setSpec(currentSpec);
                  setStep(2);
                  setEditing(true);
                }}
              >
                <SlidersHorizontal size={15} />
                Edit business
              </button>
            </div>
            <div className="selection-layout">
              <div className="capability-list">
                <div className="selection-toolbar">
                  <span>
                    {result.capabilities.length} business needs{" "}
                    <span className="muted">
                      · {tools.length} selected tools
                    </span>
                  </span>
                  <div>
                    <button
                      className="icon-button"
                      aria-label="Undo selection"
                      disabled={cursor === 0}
                      onClick={() => move(cursor - 1)}
                    >
                      <Undo2 size={17} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Redo selection"
                      disabled={cursor === history.length - 1}
                      onClick={() => move(cursor + 1)}
                    >
                      <Redo2 size={17} />
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        change({
                          selection: result.selection,
                          spec: currentSpec,
                        })
                      }
                    >
                      <RotateCcw size={14} />
                      Reset
                    </button>
                  </div>
                </div>
                <div className="evidence-note">
                  <ShieldCheck size={18} />
                  <p>
                    Research-backed choices.{" "}
                    <span>
                      The catalog’s connections are proposed, not live-tested.
                      We’ll keep every verification item visible.
                    </span>
                  </p>
                </div>
                {result.categories.map((category) => {
                  const options = category.recommendations,
                    selected = options.find(
                      (c) => c.tool.id === selection[category.capability],
                    );
                  const others = options.filter(
                    (c) => c.tool.id !== selected?.tool.id,
                  );
                  const shown = expanded.includes(category.capability)
                    ? [...(selected ? [selected] : []), ...others]
                    : [
                        ...(selected ? [selected] : []),
                        ...others.slice(0, selected ? 1 : 2),
                      ];
                  return (
                    <section
                      className="capability-section"
                      key={category.capability}
                    >
                      <div className="category-heading">
                        <div>
                          <span className="category-dot" />
                          <h2>{label(category.capability)}</h2>
                          <span className="small muted">
                            {options.length}{" "}
                            {options.length === 1 ? "option" : "options"}
                          </span>
                        </div>
                        {options.length > 1 && (
                          <button
                            className="text-button"
                            onClick={() => {
                              track("tool_compared");
                              setCompare(category);
                            }}
                          >
                            <GitCompareArrows size={15} />
                            Compare
                          </button>
                        )}
                      </div>
                      {!options.length ? (
                        <div className="gap-card">
                          <AlertCircle size={23} />
                          <div>
                            <b>Requirement gap</b>
                            <p>
                              No supported option currently available under
                              these requirements. Edit the requirement or expand
                              the registry before confirming.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="tool-cards">
                            {shown.map((c) => (
                              <article
                                key={c.tool.id}
                                className={
                                  "tool-card " +
                                  (selection[category.capability] === c.tool.id
                                    ? "selected"
                                    : "")
                                }
                              >
                                <div className="tool-card-top">
                                  <ToolMark tool={c.tool} />
                                  <span
                                    className={
                                      "match " +
                                      (c.fit_score < 60 ? "weak" : "")
                                    }
                                  >
                                    {c.fit_score}% fit
                                  </span>
                                </div>
                                <div className="tool-title">
                                  <h3>{c.tool.name}</h3>
                                  {selection[category.capability] ===
                                    c.tool.id && (
                                    <span className="selected-label">
                                      <Check size={12} />
                                      Selected
                                    </span>
                                  )}
                                </div>
                                <span className="confidence-label">
                                  {c.confidence}
                                </span>
                                <p className="tool-description">
                                  {c.tool.description}
                                </p>
                                <div className="reason">
                                  <Check size={14} />
                                  <span>
                                    {c.why_recommended[1] ??
                                      c.why_recommended[0]}
                                  </span>
                                </div>
                                <div className="tool-price">
                                  {c.price_summary}
                                </div>
                                <div className="connection-label">
                                  <Link2 size={13} />
                                  {c.tool.integration_route} ·{" "}
                                  {c.connection_quality}
                                </div>
                                <details className="tool-details">
                                  <summary>
                                    Limitations & evidence
                                    <ChevronDown size={12} />
                                  </summary>
                                  <p>{c.limitations.join(" ")}</p>
                                  <p className="small">
                                    Readiness: {c.tool.readiness}
                                  </p>
                                  <p className="small">
                                    {c.verification_warnings.join(". ")}
                                  </p>
                                  <p className="small">
                                    Proposed setup: {c.tool.integration_setup}
                                  </p>
                                  {c.tool.references
                                    .slice(0, 2)
                                    .map((url, i) => (
                                      <a
                                        href={url}
                                        key={url + i}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        Vendor{" "}
                                        {i === 0 ? "pricing" : "reference"}
                                        <ExternalLink size={12} />
                                      </a>
                                    ))}
                                </details>
                                <button
                                  className={
                                    selection[category.capability] === c.tool.id
                                      ? "selected-button"
                                      : "secondary"
                                  }
                                  onClick={() =>
                                    select(category.capability, c.tool.id)
                                  }
                                  disabled={
                                    selection[category.capability] === c.tool.id
                                  }
                                >
                                  {selection[category.capability] ===
                                  c.tool.id ? (
                                    <>
                                      <Check size={15} />
                                      In your stack
                                    </>
                                  ) : (
                                    <>
                                      Select {c.tool.name}
                                      <Plus size={15} />
                                    </>
                                  )}
                                </button>
                              </article>
                            ))}
                          </div>
                          {options.length > 2 && (
                            <button
                              className="more-options"
                              onClick={() =>
                                setExpanded(
                                  expanded.includes(category.capability)
                                    ? expanded.filter(
                                        (x) => x !== category.capability,
                                      )
                                    : [...expanded, category.capability],
                                )
                              }
                            >
                              {expanded.includes(category.capability)
                                ? "Show fewer options"
                                : `Explore ${options.length - shown.length} more options`}
                              <ChevronDown size={13} />
                            </button>
                          )}
                          {options.length === 1 && (
                            <p className="small muted">
                              The registry currently contains one candidate for
                              this requirement.
                            </p>
                          )}
                        </>
                      )}
                    </section>
                  );
                })}
              </div>
              <aside className="stack-summary">
                <div className="summary-top">
                  <span className="eyebrow">YOUR STACK</span>
                  <span className="count">{tools.length} tools</span>
                </div>
                <h2>Coming together.</h2>
                <div className="summary-tools">
                  {tools.map((t) => (
                    <div key={t.id}>
                      <ToolMark tool={t} />
                      <div>
                        <b>{t.name}</b>
                        <span>
                          {Object.entries(selection)
                            .filter(
                              ([c, id]) =>
                                id === t.id && !c.startsWith("existing:"),
                            )
                            .map(([c]) => label(c))
                            .join(" · ") || "Existing tool"}
                        </span>
                      </div>
                      <Check size={14} />
                    </div>
                  ))}
                </div>
                <PriceSummary pricing={price} />
                <button
                  className="assumptions-button"
                  onClick={() => setAssumptions(!assumptions)}
                >
                  <SlidersHorizontal size={14} />
                  Pricing assumptions
                  <ChevronDown size={14} />
                </button>
                {assumptions && (
                  <div className="assumption-fields">
                    {(
                      [
                        "monthly_orders",
                        "monthly_transactions",
                        "monthly_messages",
                        "employees",
                        "monthly_workflow_runs",
                        "monthly_tokens",
                        "monthly_minutes",
                        "linked_accounts",
                      ] as const
                    ).map((k) => (
                      <NumericInput
                        key={k}
                        name={label(k)}
                        value={currentSpec.expected_usage[k]}
                        onChange={(n) =>
                          changeAssumption({
                            ...currentSpec,
                            expected_usage: {
                              ...currentSpec.expected_usage,
                              [k]: n,
                            },
                          })
                        }
                      />
                    ))}
                    <NumericInput
                      name="Average transaction value"
                      value={currentSpec.financials.average_transaction_value}
                      onChange={(n) =>
                        changeAssumption({
                          ...currentSpec,
                          financials: {
                            ...currentSpec.financials,
                            average_transaction_value: n,
                          },
                        })
                      }
                    />
                  </div>
                )}
                <div className="validation-status" aria-live="polite">
                  {checking ? (
                    <>
                      <LoaderCircle size={14} className="spin" />
                      Checking your changes…
                    </>
                  ) : serverValid?.valid ? (
                    <>
                      <Check size={14} />
                      Planning checks complete
                    </>
                  ) : (
                    <>
                      <AlertCircle size={14} />
                      {missing.length
                        ? `${missing.length} needs still require a tool`
                        : "Review validation items"}
                    </>
                  )}
                </div>
                <button
                  className="primary full-button"
                  disabled={
                    checking ||
                    busy ||
                    missing.length > 0 ||
                    !serverValid?.valid
                  }
                  onClick={() => {
                    setReview(true);
                    document
                      .getElementById("stack-review")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  Review stack
                  <ArrowRight size={16} />
                </button>
                {(!serverValid || !serverValid.valid) && !checking && (
                  <button
                    className="text-button"
                    onClick={() =>
                      void validate({ selection, spec: currentSpec }, selection)
                    }
                  >
                    Recheck selection
                  </button>
                )}
                <p className="summary-footnote">
                  No accounts or credentials needed.
                  <br />
                  You’re choosing your tools, not connecting them yet.
                </p>
              </aside>
            </div>
            {(serverValid?.errors.length ?? 0) > 0 && (
              <div className="error-banner" role="alert">
                <AlertCircle size={18} />
                <div>
                  {serverValid!.errors.map((e) => (
                    <p key={e}>{e}</p>
                  ))}
                </div>
              </div>
            )}
            <div
              id="stack-review"
              className={"review-panel " + (review ? "open" : "")}
            >
              <div className="section-heading">
                <div>
                  <ShieldCheck size={22} />
                  <h2>Before you confirm</h2>
                </div>
                <span className="pill">Planning stack</span>
              </div>
              <p className="muted">
                The server checks your tools, coverage, dependencies, and the
                latest registry. Unverified connections remain visible in your
                confirmed plan.
              </p>
              <details open={review}>
                <summary>
                  {(serverValid?.warnings ?? result.warnings).length}{" "}
                  verification items
                </summary>
                <ul>
                  {(serverValid?.warnings ?? result.warnings).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
              {review && (
                <>
                  <label className="acknowledge">
                    <input
                      type="checkbox"
                      checked={ack}
                      onChange={(e) => setAck(e.target.checked)}
                    />
                    <span>
                      I understand this is a planning stack. Prices may be
                      incomplete, and researched connections still need
                      verification before building.
                    </span>
                  </label>
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      checking ||
                      !serverValid?.valid ||
                      (!ack && !!serverValid.warnings.length)
                    }
                    onClick={confirm}
                  >
                    {busy ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <>
                        Confirm my stack
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </section>
        )}
        {step === 5 && confirmed && currentSpec && (
          <section className="final-page animate-in">
            <span className="complete-mark">
              <Check size={26} />
            </span>
            <span className="eyebrow">A CLEAR PLAN FOR WHAT’S NEXT</span>
            <h1 ref={heading} tabIndex={-1}>
              Your business.
              <br />
              <em>Your stack.</em>
            </h1>
            <p className="muted">
              Your tool choices are confirmed as a planning stack.
            </p>
            <div className="architecture">
              <div className="section-heading">
                <h2>How it fits together</h2>
                <span className="pill">{tools.length} selected products</span>
              </div>
              <div className="architecture-nodes">
                <div className="customer-node">
                  <span className="icon-tile">
                    <BriefcaseBusiness size={20} />
                  </span>
                  <b>Your business</b>
                  <span>{currentSpec.business_type}</span>
                </div>
                {tools.map((t) => (
                  <div className="architecture-node" key={t.id}>
                    <ToolMark tool={t} />
                    <b>{t.name}</b>
                    <span>
                      {Object.entries(selection)
                        .filter(
                          ([c, id]) =>
                            id === t.id && !c.startsWith("existing:"),
                        )
                        .map(([c]) => label(c))
                        .join(" · ")}
                    </span>
                  </div>
                ))}
              </div>
              <div className="connection-map">
                <span className="eyebrow">BUSINESS DATA FLOWS</span>
                {confirmed.architecture_edges.length ? (
                  confirmed.architecture_edges.map((e, i) => (
                    <div key={i} className={"flow-edge " + e.status}>
                      <span>
                        {allTools.find((t) => t.id === e.from)?.name ?? e.from}
                      </span>
                      <span className="flow-line">
                        <ArrowRight size={16} />
                      </span>
                      <span>
                        {allTools.find((t) => t.id === e.to)?.name ?? e.to}
                      </span>
                      <small>
                        {e.status === "verified"
                          ? "Verified"
                          : "Needs verification"}
                      </small>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    No separate tool-to-tool dependency is required by these
                    selected roles. Additional business flows may need review.
                  </p>
                )}
              </div>
              <p className="small muted">
                Flows show the intended architecture. Dashed lines require
                verification and do not represent connected accounts.
              </p>
            </div>
            <div className="final-bottom">
              <div className="final-price">
                <h2>Your estimated costs</h2>
                <PriceSummary pricing={confirmed.pricing_snapshot} />
              </div>
              <div className="next-step">
                <span className="eyebrow">THE NEXT CHAPTER</span>
                <h2>
                  From plan
                  <br />
                  to working business.
                </h2>
                <p>
                  Account connections, your customer app, and your owner
                  dashboard come in Step 2.
                </p>
                <button className="primary" disabled>
                  Build my stack <span>Coming in Step 2</span>
                </button>
                <button className="text-button" onClick={exportStack}>
                  <Download size={16} />
                  Download confirmed plan
                </button>
              </div>
            </div>
            <details className="final-warnings">
              <summary>
                {confirmed.warnings.length} known limitations and verification
                items
              </summary>
              <ul>
                {confirmed.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
            <div className="form-actions">
              <button
                className="text-button"
                onClick={() => {
                  setStep(4);
                  setReview(false);
                  setAck(false);
                }}
              >
                <ArrowLeft size={16} />
                Revise my tools
              </button>
              <span className="small muted">
                Validated{" "}
                {new Date(confirmed.confirmed_at).toLocaleDateString()} ·
                Registry {confirmed.registry_snapshot_version.slice(0, 18)}
              </span>
            </div>
          </section>
        )}
      </main>
      <footer className="footer">
        <a href="https://stitchr.studio/" className="wordmark small-logo">
          stitchr
          <Mark size={18} />
        </a>
        <span>Good businesses start with the right pieces.</span>
        <span>Step 1 · Plan your stack</span>
      </footer>
      {compare && (
        <Compare
          category={compare}
          onClose={() => setCompare(null)}
          onSelect={(id) => select(compare.capability, id)}
        />
      )}
    </>
  );
}
