import { encrypt } from "@langfuse/shared/encryption";
import { describe, expect, it, vi } from "vitest";
import { loadSsoProviders } from "@/src/ee/features/multi-tenant-sso/utils";

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

describe("loadSsoProviders — OneLogin", () => {
  it("uses a single /oidc/2 in the discovery URL for every issuer form", async () => {
    /** All rows load in one call because getSsoConfigs caches them at module level. */
    mockFindMany.mockResolvedValue([
      oneLoginRow("tenant.example", "https://example.com"),
      oneLoginRow("issuer.example", "https://example.com/oidc/2"),
      oneLoginRow("prefix.example", "https://example.com/prefix"),
    ]);

    const providers = await loadSsoProviders();

    /** `??` mirrors NextAuth's unexported merge of provider `options` over its defaults. */
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

function oneLoginRow(domain: string, issuer: string) {
  return {
    domain,
    authProvider: "onelogin",
    authConfig: {
      clientId: "onelogin-client",
      clientSecret: encrypt("onelogin-secret"),
      issuer,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
