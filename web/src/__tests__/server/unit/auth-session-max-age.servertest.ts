import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/ee/features/multi-tenant-sso/utils", () => ({
  findMultiTenantSsoConfig: vi.fn(),
  getSsoAuthProviderIdForDomain: vi.fn(),
  loadSsoProviders: vi.fn().mockResolvedValue([]),
}));

import { env } from "@/src/env.mjs";
import { getAuthOptions } from "@/src/server/auth";

describe("AUTH_SESSION_MAX_AGE", () => {
  it("defaults to 14 days in minutes", () => {
    expect(process.env.AUTH_SESSION_MAX_AGE).toBeUndefined();
    expect(env.AUTH_SESSION_MAX_AGE).toBe(14 * 24 * 60);
  });

  it("sets session.maxAge in seconds", async () => {
    const authOptions = await getAuthOptions();

    expect(authOptions.session).toEqual({
      strategy: "jwt",
      maxAge: env.AUTH_SESSION_MAX_AGE * 60,
    });
  });
});
