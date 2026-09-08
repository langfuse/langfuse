import { randomUUID } from "crypto";

import { type NextApiRequest } from "next";

import { prisma } from "@langfuse/shared/src/db";
import {
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
  createShaHash,
  getDisplaySecretKey,
} from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import {
  type DirectAuthResult,
  type VerifyOrgAuthParams,
  type VerifyProjectAuthParams,
} from "@/src/features/auth/policy/shadow.direct";

// The direct seams are imported dynamically so the authenticator singleton
// captures the admin key set in beforeAll.

type Seam = {
  verifyOrgAuth: (params: VerifyOrgAuthParams) => Promise<DirectAuthResult>;
  verifyProjectAuthDirect: (
    params: VerifyProjectAuthParams,
  ) => Promise<DirectAuthResult>;
};

const adminApiKey = "test-admin-api-key-direct-enforce-scope";

const orgKeyRequired = "org key required";

const projectKeyRequired = "project key required";

let seam: Seam;
let orgId = "";
let projectId = "";
let orgAuth = "";
let projectAuth = "";
let projectPublicKey = "";

let originalMigration: string | undefined;
let originalAdminApiKey: string | undefined;

const reqWith = (headers: Record<string, string | undefined>): NextApiRequest =>
  ({ headers, method: "GET" }) as unknown as NextApiRequest;

const setMode = (mode: string) => {
  (env as any).API_AUTH_MIGRATION = mode;
};

const dropScopeKey = ({
  scope: _apiKeyScope,
  ...rest
}: Record<string, unknown>) => rest;

const orgResultUnderModes = async (authorization: string) => {
  const params: VerifyOrgAuthParams = {
    req: reqWith({ authorization }),
    name: "Get Organization Projects",
    action: "projects:read",
    scopeDeniedMessage: orgKeyRequired,
  };
  setMode("legacy");
  const legacy = await seam.verifyOrgAuth(params);
  setMode("enforce");
  const enforce = await seam.verifyOrgAuth(params);
  return { legacy, enforce };
};

const projectResultUnderModes = async (authorization: string) => {
  const params: VerifyProjectAuthParams = {
    req: reqWith({ authorization }),
    name: "Get Project",
    action: "project:read",
    scopeDeniedMessage: projectKeyRequired,
  };
  setMode("legacy");
  const legacy = await seam.verifyProjectAuthDirect(params);
  setMode("enforce");
  const enforce = await seam.verifyProjectAuthDirect(params);
  return { legacy, enforce };
};

const scopeOf = (result: DirectAuthResult): Record<string, unknown> => {
  if (!result.validKey) throw new Error(`denied with ${result.status}`);
  return result.scope as unknown as Record<string, unknown>;
};

const createOrgApiKey = async (targetOrgId: string) => {
  const publicKey = `pk-lf-${randomUUID()}`;
  const secretKey = `sk-lf-${randomUUID()}`;
  await prisma.apiKey.create({
    data: {
      id: randomUUID(),
      orgId: targetOrgId,
      publicKey,
      hashedSecretKey: `test-hashed-secret-key-${randomUUID()}`,
      fastHashedSecretKey: createShaHash(secretKey, env.SALT as string),
      displaySecretKey: getDisplaySecretKey(secretKey),
      scope: "ORGANIZATION",
    },
  });
  return createBasicAuthHeader(publicKey, secretKey);
};

describe("the direct seams map principals to legacy-identical scopes", () => {
  beforeAll(async () => {
    originalMigration = (env as any).API_AUTH_MIGRATION;
    originalAdminApiKey = (env as any).ADMIN_API_KEY;
    (env as any).ADMIN_API_KEY = adminApiKey;

    seam =
      (await import("@/src/features/auth/policy/shadow.direct")) as unknown as Seam;

    const base = await createOrgProjectAndApiKey();
    orgId = base.orgId;
    projectId = base.projectId;
    projectAuth = base.auth;
    projectPublicKey = base.publicKey;
    orgAuth = await createOrgApiKey(orgId);
  });

  afterAll(() => {
    (env as any).API_AUTH_MIGRATION = originalMigration;
    (env as any).ADMIN_API_KEY = originalAdminApiKey;
  });

  it("an organization key on an org route yields a legacy-identical org scope", async () => {
    const { legacy, enforce } = await orgResultUnderModes(orgAuth);
    expect(scopeOf(enforce).accessLevel).toBe("organization");
    expect(scopeOf(enforce).orgId).toBe(orgId);
    expect(scopeOf(enforce).projectId).toBeNull();
    expect(dropScopeKey(scopeOf(enforce))).toEqual(
      dropScopeKey(scopeOf(legacy)),
    );
  });

  it("a project key on a project route yields a legacy-identical project scope", async () => {
    const { legacy, enforce } = await projectResultUnderModes(projectAuth);
    expect(scopeOf(enforce).accessLevel).toBe("project");
    expect(scopeOf(enforce).projectId).toBe(projectId);
    expect(dropScopeKey(scopeOf(enforce))).toEqual(
      dropScopeKey(scopeOf(legacy)),
    );
  });

  it("a project key on an org route 403s with the route's message in both modes", async () => {
    const { legacy, enforce } = await orgResultUnderModes(projectAuth);
    expect(legacy).toEqual({
      validKey: false,
      status: 403,
      error: orgKeyRequired,
    });
    expect(enforce).toEqual(legacy);
  });

  it("an organization key on a project route 403s with the route's message in both modes", async () => {
    const { legacy, enforce } = await projectResultUnderModes(orgAuth);
    expect(legacy).toEqual({
      validKey: false,
      status: 403,
      error: projectKeyRequired,
    });
    expect(enforce).toEqual(legacy);
  });

  it("a bearer-presented project key on a project route 403s in both modes", async () => {
    const { legacy, enforce } = await projectResultUnderModes(
      `Bearer ${projectPublicKey}`,
    );
    expect(legacy).toMatchObject({ validKey: false, status: 403 });
    expect(enforce).toMatchObject({ validKey: false, status: 403 });
  });

  it("the admin key is refused on both direct seams in both modes", async () => {
    const admin = `Bearer ${adminApiKey}`;
    const org = await orgResultUnderModes(admin);
    const project = await projectResultUnderModes(admin);
    expect(org.legacy).toMatchObject({ validKey: false, status: 401 });
    expect(org.enforce).toMatchObject({ validKey: false, status: 401 });
    expect(project.legacy).toMatchObject({ validKey: false, status: 401 });
    expect(project.enforce).toMatchObject({ validKey: false, status: 401 });
  });
});
