/**
 * Unit tests for MCP OIDC bearer-token verification.
 *
 * These tests exercise the JWT verification + claim extraction logic in
 * isolation: they generate keys and sign tokens in-memory with `jose`, then
 * stub `createRemoteJWKSet` so the verifier resolves the local JWK without a
 * network round-trip. DB-backed user/membership resolution is covered by the
 * dispatcher integration test surface, not here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import type * as Jose from "jose";

const ISSUER = "https://idp.example.com";
const AUDIENCE = "langfuse-mcp";

vi.mock("@/src/env.mjs", () => ({
  env: {
    MCP_AUTH_OIDC_ENABLED: "true",
    MCP_AUTH_OIDC_ISSUER: ISSUER,
    MCP_AUTH_OIDC_AUDIENCE: AUDIENCE,
    MCP_AUTH_OIDC_JWKS_URI: `${ISSUER}/.well-known/jwks.json`,
    MCP_AUTH_OIDC_USER_CLAIM: "email",
  },
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

// Stub out the heavyweight server module so importing the OIDC module under
// test does not trigger env validation for Clickhouse/S3 etc. The test
// teardown re-imports redis/logger/ClickHouseClientManager from this module,
// so provide minimal no-op shapes for those.
vi.mock("@langfuse/shared/src/server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  redis: { status: "end", disconnect: vi.fn() },
  ClickHouseClientManager: {
    getInstance: () => ({
      closeAllConnections: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock("jose", async () => {
  const actual = await vi.importActual<typeof Jose>("jose");
  return {
    ...actual,
    createRemoteJWKSet: vi.fn(),
  };
});

type Keys = {
  privateKey: CryptoKey;
  publicJwk: Awaited<ReturnType<typeof exportJWK>>;
};

async function makeKeys(): Promise<Keys> {
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.alg = "RS256";
  publicJwk.kid = "test-kid";
  return { privateKey, publicJwk };
}

async function signToken(
  privateKey: CryptoKey,
  payload: Record<string, unknown>,
  opts: { issuer?: string; audience?: string; expiresIn?: string } = {},
) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: "test-kid" })
    .setIssuedAt()
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? AUDIENCE)
    .setExpirationTime(opts.expiresIn ?? "5m")
    .sign(privateKey);
}

describe("MCP OIDC auth — token verification", () => {
  let keys: Keys;

  beforeEach(async () => {
    keys = await makeKeys();
    const jose = await import("jose");
    const actual = await vi.importActual<typeof Jose>("jose");
    // Resolve every kid to our test public key so jwtVerify succeeds.
    vi.mocked(jose.createRemoteJWKSet).mockReturnValue(
      // jose's JWKSet is a function: (header) => Promise<KeyLike>.
      (async () => actual.importJWK(keys.publicJwk, "RS256")) as never,
    );
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("verifies a valid token and returns the payload", async () => {
    const { verifyOidcToken } =
      await import("@/src/features/mcp/server/auth/oidc");
    const token = await signToken(keys.privateKey, {
      email: "user@example.com",
    });
    const payload = await verifyOidcToken(token);
    expect(payload.email).toBe("user@example.com");
    expect(payload.iss).toBe(ISSUER);
    expect(payload.aud).toBe(AUDIENCE);
  });

  it("rejects a token signed by a different issuer", async () => {
    const { verifyOidcToken } =
      await import("@/src/features/mcp/server/auth/oidc");
    const token = await signToken(
      keys.privateKey,
      { email: "u@x.com" },
      {
        issuer: "https://attacker.example.com",
      },
    );
    await expect(verifyOidcToken(token)).rejects.toThrow(/Invalid OIDC token/);
  });

  it("rejects a token whose audience does not match", async () => {
    const { verifyOidcToken } =
      await import("@/src/features/mcp/server/auth/oidc");
    const token = await signToken(
      keys.privateKey,
      { email: "u@x.com" },
      {
        audience: "some-other-app",
      },
    );
    await expect(verifyOidcToken(token)).rejects.toThrow(/Invalid OIDC token/);
  });

  it("rejects an expired token", async () => {
    const { verifyOidcToken } =
      await import("@/src/features/mcp/server/auth/oidc");
    const token = await new SignJWT({ email: "u@x.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test-kid" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(keys.privateKey);
    await expect(verifyOidcToken(token)).rejects.toThrow(/Invalid OIDC token/);
  });
});

describe("MCP OIDC auth — bearer-token extraction & enablement", () => {
  it("extracts the token from `Bearer <jwt>` (case-insensitive)", async () => {
    const { extractBearerToken } =
      await import("@/src/features/mcp/server/auth/oidc");
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(extractBearerToken("bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("returns null for a Basic auth header", async () => {
    const { extractBearerToken } =
      await import("@/src/features/mcp/server/auth/oidc");
    expect(extractBearerToken("Basic abc==")).toBeNull();
  });

  it("returns null when the header is absent", async () => {
    const { extractBearerToken } =
      await import("@/src/features/mcp/server/auth/oidc");
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it("reports OIDC enabled when env is configured", async () => {
    const { isOidcEnabled } =
      await import("@/src/features/mcp/server/auth/oidc");
    expect(isOidcEnabled()).toBe(true);
  });
});
