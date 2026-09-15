import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSameOrigin } from "../src/lib/origin";
import { readBody } from "../src/lib/api";
const request = (
  headers: Record<string, string> = {},
  url = "http://0.0.0.0:3000/api/onboarding/analyze",
) => new Request(url, { method: "POST", headers, body: '{"ok":true}' });
afterEach(() => vi.unstubAllEnvs());
describe("browser origin validation", () => {
  it.each([
    "localhost:3000",
    "127.0.0.1:3000",
    "[::1]:3000",
    "192.168.1.20:3000",
  ])(
    "accepts the actual request host %s when Next uses a wildcard listener",
    async (host) => {
      vi.stubEnv("APP_ORIGIN", "");
      await expect(
        readBody(request({ host, origin: `http://${host}` })),
      ).resolves.toEqual({ ok: true });
    },
  );
  it("falls back to the request URL when Host is absent", () => {
    vi.stubEnv("APP_ORIGIN", "");
    expect(() =>
      assertSameOrigin(
        request(
          { origin: "http://localhost:3000" },
          "http://localhost:3000/api/events",
        ),
      ),
    ).not.toThrow();
  });
  it.each([
    "https://attacker.example",
    "http://localhost:3001",
    "https://localhost:3000",
    "http://127.0.0.1:3000",
    "http://0.0.0.0:3000",
    "null",
    "",
    "not-a-url",
    "http://localhost:3000/path",
    "http://localhost:3000@attacker.example",
  ])("rejects mismatched or malformed Origin %j", (origin) => {
    vi.stubEnv("APP_ORIGIN", "");
    expect(() =>
      assertSameOrigin(request({ host: "localhost:3000", origin })),
    ).toThrow("ORIGIN_REJECTED");
  });
  it("does not trust spoofed forwarded host or protocol headers", () => {
    vi.stubEnv("APP_ORIGIN", "");
    expect(() =>
      assertSameOrigin(
        request({
          host: "localhost:3000",
          origin: "https://attacker.example",
          "x-forwarded-host": "attacker.example",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toThrow("ORIGIN_REJECTED");
  });
  it("rejects malformed Host headers", () => {
    vi.stubEnv("APP_ORIGIN", "");
    expect(() =>
      assertSameOrigin(
        request({
          host: "localhost:3000@attacker.example",
          origin: "http://attacker.example",
        }),
      ),
    ).toThrow("ORIGIN_REJECTED");
  });
  it("allows requests without Origin but rejects explicit cross-site browser requests", () => {
    expect(() => assertSameOrigin(request())).not.toThrow();
    expect(() =>
      assertSameOrigin(request({ "sec-fetch-site": "cross-site" })),
    ).toThrow("ORIGIN_REJECTED");
  });
  it("supports an explicitly configured HTTPS public origin behind a proxy", () => {
    vi.stubEnv("APP_ORIGIN", "https://stitchr.example");
    expect(() =>
      assertSameOrigin(
        request({ host: "internal:3000", origin: "https://stitchr.example" }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(
        request({ host: "internal:3000", origin: "http://internal:3000" }),
      ),
    ).toThrow("ORIGIN_REJECTED");
  });
  it("fails closed on an invalid canonical public origin", () => {
    vi.stubEnv("APP_ORIGIN", "not-a-url");
    expect(() =>
      assertSameOrigin(request({ origin: "http://localhost:3000" })),
    ).toThrow("APP_ORIGIN_INVALID");
  });
});
