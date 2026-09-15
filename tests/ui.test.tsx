// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Builder from "../src/app/builder";
import { emptySpec } from "../src/lib/requirements/schema";
import { catalogRegistry } from "../src/lib/registry/catalog";
import { recommend, revalidate, validateStack } from "../src/lib/stack/engine";
const spec = {
  ...emptySpec("A payment business in the US"),
  business_type: "payment business",
  country: "US",
  required_features: ["payments"],
  expected_usage: { ...emptySpec().expected_usage, monthly_orders: 1000 },
  financials: { ...emptySpec().financials, average_transaction_value: 35 },
};
const registry = catalogRegistry();
let failRevalidation = false;
beforeEach(() => {
  failRevalidation = false;
  vi.stubGlobal("scrollTo", vi.fn());
  Object.defineProperty(navigator, "sendBeacon", {
    value: vi.fn(),
    configurable: true,
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      let data: unknown;
      if (path.includes("analyze"))
        data = { business_spec: spec, complete: true };
      else if (path.includes("recommend")) data = recommend(body, registry);
      else if (path.includes("revalidate")) {
        if (failRevalidation)
          return {
            ok: false,
            json: async () => ({
              error: "Revalidation unavailable. Please retry.",
            }),
          };
        data = {
          ...revalidate(
            body.business_spec,
            registry,
            body.previous_stack,
            body.selected_stack,
          ),
          refreshed_recommendation: null,
        };
      } else if (path.includes("confirm"))
        data = {
          ...validateStack(body.business_spec, registry, body.selected_stack),
          id: "test-stack",
          confirmed_at: "2026-09-15T12:00:00Z",
          validated_stack: body.selected_stack,
          registry_snapshot_version: registry.version,
        };
      return { ok: true, json: async () => data };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function toSelection() {
  const user = userEvent.setup();
  render(<Builder demo />);
  await user.type(
    screen.getByRole("textbox", { name: "What are you building?" }),
    "A payment business in the US",
  );
  await user.click(screen.getByRole("button", { name: "Find my stack" }));
  await screen.findByRole("heading", { name: /big picture/ });
  await user.click(screen.getByRole("button", { name: /Looks good/ }));
  await screen.findByRole("heading", { name: /Your tools/ });
  await screen.findByText("Planning checks complete");
  return user;
}
it("completes describe → summary → comparison → swap → undo/redo → confirmation", async () => {
  const user = await toSelection();
  await user.click(screen.getByRole("button", { name: /^Compare$/ }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(
    within(screen.getByRole("dialog")).getByText("Integration quality"),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Close comparison" }));
  await user.click(screen.getAllByRole("button", { name: /^Select / })[0]);
  await screen.findByText("Planning checks complete");
  expect(
    (
      screen.getByRole("button", {
        name: "Undo selection",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  await user.click(screen.getByRole("button", { name: "Undo selection" }));
  await screen.findByText("Planning checks complete");
  expect(
    (
      screen.getByRole("button", {
        name: "Redo selection",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  await user.click(screen.getByRole("button", { name: "Redo selection" }));
  await screen.findByText("Planning checks complete");
  Element.prototype.scrollIntoView = vi.fn();
  await user.click(screen.getByRole("button", { name: "Review stack" }));
  await user.click(screen.getByRole("checkbox", { name: /I understand/ }));
  await user.click(screen.getByRole("button", { name: "Confirm my stack" }));
  await screen.findByRole("heading", { name: /Your business.*Your stack./ });
  expect(
    screen.getByRole("heading", { name: "How it fits together" }),
  ).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: /Build my stack/,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "Download confirmed plan" }),
  ).toBeTruthy();
}, 20000);
it("recalculates pricing assumptions immediately and revalidates before confirmation", async () => {
  const user = await toSelection();
  await user.click(screen.getByRole("button", { name: "Pricing assumptions" }));
  const input = screen.getByRole("spinbutton", { name: "Monthly Orders" });
  await user.clear(input);
  await user.type(input, "2000");
  await screen.findByText("Planning checks complete");
  expect((input as HTMLInputElement).value).toBe("2000");
  const calls = vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes("revalidate"));
  expect(
    JSON.parse(String(calls.at(-1)![1]!.body)).business_spec.expected_usage
      .monthly_orders,
  ).toBe(2000);
});
it("keeps choices and blocks confirmation when server revalidation fails", async () => {
  const user = await toSelection();
  failRevalidation = true;
  await user.click(screen.getAllByRole("button", { name: /^Select / })[0]);
  await screen.findByText("Revalidation unavailable. Please retry.");
  expect(
    (screen.getByRole("button", { name: "Review stack" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "Recheck selection" }),
  ).toBeTruthy();
});
it("shows adaptive questions and permits intentionally unknown answers", async () => {
  vi.mocked(fetch).mockImplementationOnce(
    async () =>
      ({
        ok: true,
        json: async () => ({
          business_spec: {
            ...spec,
            clarification_questions: [
              "Which country will your business primarily operate in?",
            ],
          },
          complete: false,
        }),
      }) as Response,
  );
  const user = userEvent.setup();
  render(<Builder demo />);
  await user.type(
    screen.getByRole("textbox", { name: "What are you building?" }),
    "A new business",
  );
  await user.click(screen.getByRole("button", { name: "Find my stack" }));
  await screen.findByText(
    "Which country will your business primarily operate in?",
  );
  await user.click(
    screen.getByRole("button", { name: "Keep unknowns and continue" }),
  );
  await screen.findByRole("heading", { name: /big picture/ });
});
