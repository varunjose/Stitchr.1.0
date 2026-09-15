function parseOrigin(value: string): URL {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Invalid origin");
  }
  return url;
}

export function assertSameOrigin(req: Request): void {
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    throw new Error("ORIGIN_REJECTED");
  }

  // Non-browser API callers may omit Origin; an explicitly opaque or malformed
  // browser origin must never be treated as an omitted header.
  const origin = req.headers.get("origin");
  if (origin === null) return;

  let expected: string;
  const configured = process.env.APP_ORIGIN;
  if (configured) {
    try {
      expected = parseOrigin(configured).origin;
    } catch {
      throw new Error("APP_ORIGIN_INVALID");
    }
  } else {
    try {
      const requestURL = new URL(req.url);
      // Next.js can construct req.url using its listener (0.0.0.0), while
      // the browser addresses localhost, 127.0.0.1, or a LAN hostname. Host
      // identifies that request destination and retains its exact port.
      const host = req.headers.get("host") ?? requestURL.host;
      if (!host || /[\s,/@\\?#]/.test(host)) throw new Error("Invalid host");
      expected = parseOrigin(`${requestURL.protocol}//${host}`).origin;
    } catch {
      throw new Error("ORIGIN_REJECTED");
    }
  }

  try {
    const parsed = parseOrigin(origin);
    if (origin !== parsed.origin || parsed.origin !== expected) {
      throw new Error("Origin mismatch");
    }
  } catch {
    throw new Error("ORIGIN_REJECTED");
  }
  // Deliberately do not trust arbitrary forwarded-host/proto headers or allow
  // every localhost origin. Proxied deployments can pin APP_ORIGIN explicitly.
}
