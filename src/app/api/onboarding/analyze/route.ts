import { NextResponse } from "next/server";
import { analyzeRequirements } from "@/lib/requirements/service";
import { readBody, apiError } from "@/lib/api";
export async function POST(req: Request) {
  try {
    return NextResponse.json(await analyzeRequirements(await readBody(req)));
  } catch (e) {
    return apiError(e);
  }
}
