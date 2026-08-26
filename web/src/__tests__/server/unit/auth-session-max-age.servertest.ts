import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/ee/features/multi-tenant-sso/utils", () => ({
  findMultiTenantSsoConfig: vi.fn(),
  getSsoAuthProviderIdForDomain: vi.fn(),
  loadSsoProviders: vi.fn().mockResolvedValue([]),
}));

import {
  authSessionMaxAgeMinutesSchema,
  DEFAULT_AUTH_SESSION_MAX_AGE_MINUTES,
  env,
} from "@/src/env.mjs";
import { getAuthOptions } from "@/src/server/auth";

describe("AUTH_SESSION_MAX_AGE", () => {
  it("defaults to 14 days in minutes", () => {
    expect(DEFAULT_AUTH_SESSION_MAX_AGE_MINUTES).toBe(14 * 24 * 60);
    expect(authSessionMaxAgeMinutesSchema.parse(undefined)).toBe(
      DEFAULT_AUTH_SESSION_MAX_AGE_MINUTES,
    );
  });

  it("accepts an override in minutes", () => {
    expect(authSessionMaxAgeMinutesSchema.parse("43200")).toBe(43200);
    expect(authSessionMaxAgeMinutesSchema.parse(120)).toBe(120);
  });

  it("rejects values at or below 5", () => {
    expect(() => authSessionMaxAgeMinutesSchema.parse(5)).toThrow(
      /AUTH_SESSION_MAX_AGE must be > 5/,
    );
    expect(() => authSessionMaxAgeMinutesSchema.parse("0")).toThrow();
  });

  it("sets session.maxAge in seconds", async () => {
    const authOptions = await getAuthOptions();

    expect(authOptions.session).toEqual({
      strategy: "jwt",
      maxAge: env.AUTH_SESSION_MAX_AGE * 60,
    });
  });
});
