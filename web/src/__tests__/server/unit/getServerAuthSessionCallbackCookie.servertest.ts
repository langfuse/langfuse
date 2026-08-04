import { describe, expect, it } from "vitest";

import { getServerAuthSession } from "@/src/server/auth";
import { getCookieName } from "@/src/server/utils/cookies";

// getServerSession only reads headers/cookies from the request and writes
// response headers, so plain doubles are sufficient.
const makeCtx = (cookies: Record<string, string>) => {
  const headers: Record<string, unknown> = {};
  return {
    req: { cookies, headers: { host: "localhost:3000" } },
    res: {
      setHeader: (name: string, value: unknown) => {
        headers[name] = value;
      },
      getHeader: (name: string) => headers[name],
    },
  } as unknown as Parameters<typeof getServerAuthSession>[0];
};

describe("getServerAuthSession callback-url cookie handling", () => {
  it("resolves to null for an unauthenticated request when the callback-url cookie is fuzzed garbage", async () => {
    // Payload observed in the 2026-08-03 prod-us/prod-eu scanner sweep.
    // NextAuth's assertConfig classifies a non-URL callback-url cookie as a
    // server misconfiguration and rejects the whole request with a 500.
    const ctx = makeCtx({
      [getCookieName("next-auth.callback-url")]: " /bin/sleep 0 \r",
    });

    await expect(getServerAuthSession(ctx)).resolves.toBeNull();
  });

  it("resolves to null for an unauthenticated request with a valid relative callback-url cookie", async () => {
    const ctx = makeCtx({
      [getCookieName("next-auth.callback-url")]: "/project/some-project-id",
    });

    await expect(getServerAuthSession(ctx)).resolves.toBeNull();
  });
});
