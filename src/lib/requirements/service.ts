import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  businessSpecSchema,
  conversationSchema,
  type AnalyzeInput,
} from "./schema";
import { requirementsPrompt } from "./prompt";
import { demoAnalyze } from "./demo";
export async function analyzeRequirements(raw: AnalyzeInput) {
  const input = conversationSchema.parse(raw);
  if (process.env.REQUIREMENTS_MODE === "demo") {
    const business_spec = businessSpecSchema.parse(demoAnalyze(input));
    return {
      business_spec,
      clarification_questions: business_spec.clarification_questions,
      complete: !business_spec.clarification_questions.length,
      mode: "demo" as const,
    };
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("AI_NOT_CONFIGURED");
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 20000,
    maxRetries: 1,
  });
  const response = await client.responses.parse({
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    store: false,
    input: [
      { role: "system", content: requirementsPrompt },
      { role: "user", content: JSON.stringify(input) },
    ],
    text: { format: zodTextFormat(businessSpecSchema, "business_spec") },
    max_output_tokens: 4000,
  });
  if (!response.output_parsed) throw new Error("EXTRACTION_FAILED");
  const business_spec = businessSpecSchema.parse(response.output_parsed);
  if (
    business_spec.clarification_questions.length !==
    business_spec.missing_critical_fields.length
  )
    throw new Error("EXTRACTION_FAILED");
  return {
    business_spec,
    clarification_questions: business_spec.clarification_questions,
    complete: !business_spec.clarification_questions.length,
    mode: "openai" as const,
  };
}
