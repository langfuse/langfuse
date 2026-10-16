import { encrypt } from "@langfuse/shared/encryption";
import { describe, expect, it, vi } from "vitest";

const { mockFindMany } = vi.hoisted(() => ({ mockFindMany: vi.fn() }));

vi.mock("@langfuse/shared/src/db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({ ssoConfig: { findMany: mockFindMany } }),
  },
}));

vi.mock("@/src/ee/features/multi-tenant-sso/multiTenantSsoAvailable", () => ({
  multiTenantSsoAvailable: true,
}));

import { loadSsoProviders } from "@/src/ee/features/multi-tenant-sso/utils";

const oneLoginRow = (domain: string, issuer: string) => ({
  domain,
  authProvider: "onelogin",
  authConfig: {
    clientId: "onelogin-client",
    clientSecret: encrypt("onelogin-secret"),
    issuer,
  },
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("loadSsoProviders — OneLogin", () => {
  it("uses a single /oidc/2 in the discovery URL for every issuer form", async () => {
    // One call only: getSsoConfigs caches the rows at module level.
    mockFindMany.mockResolvedValue([
      oneLoginRow("tenant.example", "https://example.com"),
      oneLoginRow("issuer.example", "https://example.com/oidc/2"),
      oneLoginRow("prefix.example", "https://example.com/prefix"),
    ]);

    const providers = await loadSsoProviders();

    // NextAuth merges the provider's `options` over its defaults when it
    // parses providers; that merge is not exported, so mirror it with `??`.
    const wellKnownById = Object.fromEntries(
      providers.flatMap((p) =>
        p.type === "oauth"
          ? [[p.options?.id ?? p.id, p.options?.wellKnown ?? p.wellKnown]]
          : [],
      ),
    );
    expect(wellKnownById).toEqual({
      "tenant.example.onelogin":
        "https://example.com/oidc/2/.well-known/openid-configuration",
      "issuer.example.onelogin":
        "https://example.com/oidc/2/.well-known/openid-configuration",
      "prefix.example.onelogin":
        "https://example.com/prefix/oidc/2/.well-known/openid-configuration",
    });
  });
});
