import { type NextApiRequest } from "next";

import {
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import { type VerifyAuthParams } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";

// Proves the enforce mapper returns a scope byte-identical to legacy's across
// credential kinds. The parity matrix asserts status; this asserts scope
// fields. verifyAuth is imported dynamically so the authenticator singleton
// captures the admin key set in beforeAll.

type VerifyAuth = (
  params: VerifyAuthParams,
) => Promise<{ validKey: true; scope: Record<string, unknown> }>;

const adminApiKey = "test-admin-api-key-enforce-scope";

let verifyAuth: VerifyAuth;
let projectId = "";
let publicKey = "";
let secretKey = "";

let originalMigration: string | undefined;
let originalAdminApiKey: string | undefined;
let originalCloudRegion: string | undefined;

const reqWith = (headers: Record<string, string | undefined>): NextApiRequest =>
  ({ headers, method: "GET" }) as unknown as NextApiRequest;

const setMode = (mode: string) => {
  (env as any).API_AUTH_MIGRATION = mode;
};

const dropScopeKey = ({
  scope: _apiKeyScope,
  ...rest
}: Record<string, unknown>) => rest;

const scopeUnderModes = async (params: VerifyAuthParams) => {
  setMode("legacy");
  const legacy = await verifyAuth(params);
  setMode("enforce");
  const enforce = await verifyAuth(params);
  return { legacy: legacy.scope, enforce: enforce.scope };
};

describe("enforce maps principals to legacy-identical scopes", () => {
  beforeAll(async () => {
    originalMigration = (env as any).API_AUTH_MIGRATION;
    originalAdminApiKey = (env as any).ADMIN_API_KEY;
    originalCloudRegion = (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    (env as any).ADMIN_API_KEY = adminApiKey;

    ({ verifyAuth } =
      (await import("@/src/features/public-api/server/createAuthedProjectAPIRoute")) as unknown as {
        verifyAuth: VerifyAuth;
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
      name: "Get Traces",
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
      name: "Create Score",
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
      name: "Get Models",
      action: "models:read",
      isAdminApiKeyAuthAllowed: true,
    });
    expect(enforce.apiKeyId).toBe("ADMIN_API_KEY");
    expect(enforce.projectId).toBe(projectId);
    expect(dropScopeKey(enforce)).toEqual(dropScopeKey(legacy));
  });

  it("admin key on Langfuse Cloud is refused in legacy and enforce", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "us";
    const params: VerifyAuthParams = {
      req: reqWith({
        authorization: `Bearer ${adminApiKey}`,
        "x-langfuse-admin-api-key": adminApiKey,
        "x-langfuse-project-id": projectId,
      }),
      name: "Get Models",
      action: "models:read",
      isAdminApiKeyAuthAllowed: true,
    };
    const cloudDenial = {
      status: 403,
      message: "Admin API key auth is not available on Langfuse Cloud",
    };
    setMode("legacy");
    await expect(verifyAuth(params)).rejects.toEqual(cloudDenial);
    setMode("enforce");
    await expect(verifyAuth(params)).rejects.toEqual(cloudDenial);
  });
});
