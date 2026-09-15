import { NextResponse } from "next/server";
import { ZodError } from "zod";
export async function readBody(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    throw new Error("ORIGIN_REJECTED");
  const text = await req.text();
  if (text.length > 50000) throw new Error("BODY_TOO_LARGE");
  return JSON.parse(text);
}
export function apiError(e: unknown) {
  if (e instanceof ZodError)
    return NextResponse.json(
      {
        error: "Please check the supplied requirements.",
        code: "INVALID_INPUT",
        fields: e.issues.map((i) => i.path.join(".")),
      },
      { status: 400 },
    );
  if (e instanceof SyntaxError)
    return NextResponse.json(
      { error: "Invalid request body.", code: "INVALID_INPUT" },
      { status: 400 },
    );
  const code = e instanceof Error ? e.message : "";
  const messages: Record<string, string> = {
    AI_NOT_CONFIGURED:
      "Requirements interpretation is not configured. Set OPENAI_API_KEY on the server or use the explicitly labeled local demo.",
    EXTRACTION_FAILED:
      "We could not reliably understand that response. Please retry or edit your requirements.",
    REGISTRY_UNAVAILABLE:
      "The tool registry is unavailable. Please retry after the database is configured.",
    BODY_TOO_LARGE: "That description is too long.",
    ORIGIN_REJECTED: "This request came from an unexpected origin.",
  };
  console.error(
    JSON.stringify({
      event: "request_failed",
      code: messages[code] ? code : "SERVICE_UNAVAILABLE",
    }),
  );
  return NextResponse.json(
    {
      error:
        messages[code] ??
        "This service is temporarily unavailable. Your choices have been kept; please retry.",
      code: messages[code] ? code : "SERVICE_UNAVAILABLE",
    },
    {
      status:
        code === "BODY_TOO_LARGE"
          ? 413
          : code === "ORIGIN_REJECTED"
            ? 403
            : 503,
    },
  );
}
