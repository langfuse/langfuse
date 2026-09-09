import { type NextApiRequest } from "next";

import {
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import { type ShadowAuthParams } from "@/src/features/public-api/server/shadowAuth";

// Proves the enforce mapper returns a scope byte-identical to legacy's across
// credential kinds. The parity matrix asserts status; this asserts scope
// fields. shadowAuth is imported dynamically so the authenticator singleton
// captures the admin key set in beforeAll.

type VerifyAuth = (
  params: ShadowAuthParams,
) => Promise<
  | { success: true; scope: Record<string, unknown> }
  | { success: false; error: { httpCode: number; message: string } }
>;

const adminApiKey = "test-admin-api-key-enforce-scope";

let verifyAuth: VerifyAuth;
let projectId = "";
let publicKey = "";
let secretKey = "";

let originalMigration: string | undefined;
let originalAdminApiKey: string | undefined;
let originalCloudRegion: string | undefined;

const reqWith = (headers: Record<string, string | undefined>): NextApiRequest =>
  ({ headers, method: "GET", query: {} }) as unknown as NextApiRequest;

const setMode = (mode: string) => {
  (env as any).API_AUTH_MIGRATION = mode;
};

const dropScopeKey = ({
  scope: _apiKeyScope,
  ...rest
}: Record<string, unknown>) => rest;

const scopeUnderModes = async (params: ShadowAuthParams) => {
  setMode("legacy");
  const legacy = await verifyAuth(params);
  setMode("enforce");
  const enforce = await verifyAuth(params);
  if (!legacy.success || !enforce.success) throw new Error("expected success");
  return { legacy: legacy.scope, enforce: enforce.scope };
};

describe("enforce maps principals to legacy-identical scopes", () => {
  beforeAll(async () => {
    originalMigration = (env as any).API_AUTH_MIGRATION;
    originalAdminApiKey = (env as any).ADMIN_API_KEY;
    originalCloudRegion = (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    (env as any).ADMIN_API_KEY = adminApiKey;

    ({ shadowAuth: verifyAuth } =
      (await import("@/src/features/public-api/server/shadowAuth")) as unknown as {
        shadowAuth: VerifyAuth;
      });

    const base = await createOrgProjectAndApiKey();
    projectId = base.projectId;
    publicKey = base.publicKey;
    secretKey = base.secretKey;
  });

  afterAll(() => {
    (env as any).API_AUTH_MIGRATION = originalMigration;
    (env as any).ADMIN_API_KEY = originalAdminApiKey;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
  });

  it("private-key basic yields a legacy-identical project scope", async () => {
    const { legacy, enforce } = await scopeUnderModes({
      req: reqWith({
        authorization: createBasicAuthHeader(publicKey, secretKey),
      }),
      action: "traces:read",
      allowedAccessLevels: ["project"],
    });
    expect(enforce.accessLevel).toBe("project");
    expect(enforce.projectId).toBe(projectId);
    expect(dropScopeKey(enforce)).toEqual(dropScopeKey(legacy));
  });

  it("public-key bearer on a score-ingest route yields the scores access level", async () => {
    const { legacy, enforce } = await scopeUnderModes({
      req: reqWith({ authorization: `Bearer ${publicKey}` }),
      action: "scores:create",
      allowedAccessLevels: ["project", "scores"],
    });
    expect(enforce.accessLevel).toBe("scores");
    expect(dropScopeKey(enforce)).toEqual(dropScopeKey(legacy));
  });

  it("admin key on self-host yields the synthesized admin scope", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    const { legacy, enforce } = await scopeUnderModes({
      req: reqWith({
        authorization: `Bearer ${adminApiKey}`,
        "x-langfuse-admin-api-key": adminApiKey,
        "x-langfuse-project-id": projectId,
      }),
      action: "models:read",
      isAdminApiKeyAuthAllowed: true,
      allowedAccessLevels: ["project"],
    });
    expect(enforce.apiKeyId).toBe("ADMIN_API_KEY");
    expect(enforce.projectId).toBe(projectId);
    expect(dropScopeKey(enforce)).toEqual(dropScopeKey(legacy));
  });

  it("admin key on Langfuse Cloud is refused in legacy and enforce", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
    const params: ShadowAuthParams = {
      req: reqWith({
        authorization: `Bearer ${adminApiKey}`,
        "x-langfuse-admin-api-key": adminApiKey,
        "x-langfuse-project-id": projectId,
      }),
      action: "models:read",
      isAdminApiKeyAuthAllowed: true,
      allowedAccessLevels: ["project"],
    };
    const cloudDenial = {
      success: false,
      error: {
        httpCode: 403,
        message: "Admin API key auth is not available on Langfuse Cloud",
      },
    };
    setMode("legacy");
    expect(await verifyAuth(params)).toMatchObject(cloudDenial);
    setMode("enforce");
    expect(await verifyAuth(params)).toMatchObject(cloudDenial);
  });
});
