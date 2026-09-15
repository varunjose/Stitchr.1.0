export const eventNames = [
  "onboarding_started",
  "business_description_submitted",
  "clarification_answered",
  "requirements_confirmed",
  "stack_generated",
  "tool_compared",
  "tool_changed",
  "compatibility_warning_shown",
  "price_assumption_changed",
  "stack_confirmed",
  "drop_off",
] as const;
export type EventName = (typeof eventNames)[number];
export function logEvent(
  event: EventName,
  metadata: Record<string, string | number | boolean> = {},
) {
  console.info(
    JSON.stringify({ event, ...metadata, at: new Date().toISOString() }),
  );
}
export function track(
  event: EventName,
  metadata: Record<string, string | number | boolean> = {},
) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ event, metadata });
  navigator.sendBeacon?.(
    "/api/events",
    new Blob([body], { type: "application/json" }),
  );
}
