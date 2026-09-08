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
} from "@/src/features/auth/policy/shadow.direct";
import {
  type OrganizationAction,
  type ProjectAction,
} from "@/src/features/auth/policy/types";
import { type VerifyAuthParams } from "@/src/features/public-api/server/verifyProjectAuth";

// The seams are imported dynamically so the authenticator singleton captures
// the admin key set in beforeAll.

type OrgSeam = {
  verifyOrgAuth: (params: VerifyOrgAuthParams) => Promise<DirectAuthResult>;
};

type ProjectVerify = (params: VerifyAuthParams) => Promise<{
  validKey: true;
  scope: Record<string, unknown>;
}>;

const adminApiKey = "test-admin-api-key-direct-enforce-scope";

let orgSeam: OrgSeam;
let verifyProjectAuth: ProjectVerify;
let orgId = "";
let projectId = "";
let foreignProjectId = "";
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

const asResult = async (
  fn: () => Promise<{ validKey: true; scope: Record<string, unknown> }>,
): Promise<DirectAuthResult> => {
  try {
    return (await fn()) as unknown as DirectAuthResult;
  } catch (error: any) {
    return { validKey: false, status: error.status, error: error.message };
  }
};

const orgResultUnderModes = async (
  authorization: string,
  action: OrganizationAction = "projects:read",
) => {
  const params: VerifyOrgAuthParams = {
    req: reqWith({ authorization }),
    action,
  };
  setMode("legacy");
  const legacy = await orgSeam.verifyOrgAuth(params);
  setMode("enforce");
  const enforce = await orgSeam.verifyOrgAuth(params);
  return { legacy, enforce };
};

const projectResultUnderModes = async (
  authorization: string,
  target?: string,
) => {
  const params: VerifyAuthParams = {
    req: reqWith({ authorization, "x-langfuse-project-id": target }),
    action: "project:read",
  };
  setMode("legacy");
  const legacy = await asResult(() => verifyProjectAuth(params));
  setMode("enforce");
  const enforce = await asResult(() => verifyProjectAuth(params));
  return { legacy, enforce };
};

const projectNestedUnderModes = async (
  authorization: string,
  target: string,
  action: ProjectAction = "apiKeys:read",
) => {
  const params: VerifyOrgAuthParams = {
    req: reqWith({ authorization }),
    projectId: target,
    action,
  };
  setMode("legacy");
  const legacy = await orgSeam.verifyOrgAuth(params);
  setMode("enforce");
  const enforce = await orgSeam.verifyOrgAuth(params);
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

    orgSeam =
      (await import("@/src/features/auth/policy/shadow.direct")) as unknown as OrgSeam;
    ({ verifyProjectAuth } =
      (await import("@/src/features/public-api/server/verifyProjectAuth")) as unknown as {
        verifyProjectAuth: ProjectVerify;
      });

    const base = await createOrgProjectAndApiKey();
    orgId = base.orgId;
    projectId = base.projectId;
    projectAuth = base.auth;
    projectPublicKey = base.publicKey;
    orgAuth = await createOrgApiKey(orgId);

    const foreign = await createOrgProjectAndApiKey();
    foreignProjectId = foreign.projectId;
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

  const orgRouteActions: OrganizationAction[] = [
    "organization:CRUD_apiKeys",
    "organizationMembers:read",
    "organizationMembers:CUD",
    "projects:create",
  ];

  it.each(orgRouteActions)(
    "an organization key is authorized for %s in both modes",
    async (action) => {
      const { legacy, enforce } = await orgResultUnderModes(orgAuth, action);
      expect(scopeOf(enforce).accessLevel).toBe("organization");
      expect(dropScopeKey(scopeOf(enforce))).toEqual(
        dropScopeKey(scopeOf(legacy)),
      );
    },
  );

  it.each(orgRouteActions)(
    "a project key on an org route 403s for %s in both modes",
    async (action) => {
      const { legacy, enforce } = await orgResultUnderModes(
        projectAuth,
        action,
      );
      expect(legacy).toMatchObject({ validKey: false, status: 403 });
      expect(enforce).toMatchObject({ validKey: false, status: 403 });
    },
  );

  it("a project key on a project route yields a legacy-identical project scope", async () => {
    const { legacy, enforce } = await projectResultUnderModes(projectAuth);
    expect(scopeOf(enforce).accessLevel).toBe("project");
    expect(scopeOf(enforce).projectId).toBe(projectId);
    expect(dropScopeKey(scopeOf(enforce))).toEqual(
      dropScopeKey(scopeOf(legacy)),
    );
  });

  it("a project key on an org route 403s in both modes", async () => {
    const { legacy, enforce } = await orgResultUnderModes(projectAuth);
    expect(legacy).toMatchObject({ validKey: false, status: 403 });
    expect(enforce).toMatchObject({ validKey: false, status: 403 });
  });

  it("an organization key naming a project it owns is 403 in legacy and authorized in enforce", async () => {
    const { legacy, enforce } = await projectResultUnderModes(
      orgAuth,
      projectId,
    );
    expect(legacy).toMatchObject({ validKey: false, status: 403 });
    expect(scopeOf(enforce).accessLevel).toBe("project");
    expect(scopeOf(enforce).projectId).toBe(projectId);
    expect(scopeOf(enforce).orgId).toBe(orgId);
  });

  it("an organization key naming no project 403s in both modes", async () => {
    const { legacy, enforce } = await projectResultUnderModes(orgAuth);
    expect(legacy).toMatchObject({ validKey: false, status: 403 });
    expect(enforce).toMatchObject({ validKey: false, status: 403 });
  });

  it("a bearer-presented project key on a project route 403s in both modes", async () => {
    const { legacy, enforce } = await projectResultUnderModes(
      `Bearer ${projectPublicKey}`,
    );
    expect(legacy).toMatchObject({ validKey: false, status: 403 });
    expect(enforce).toMatchObject({ validKey: false, status: 403 });
  });

  it("an organization key on a project-nested route stays org-gated in legacy and authorizes its own project in enforce", async () => {
    const { legacy, enforce } = await projectNestedUnderModes(
      orgAuth,
      projectId,
    );
    expect(scopeOf(legacy).accessLevel).toBe("organization");
    expect(scopeOf(enforce).projectId).toBe(projectId);
    expect(scopeOf(enforce).orgId).toBe(orgId);
  });

  it("an organization key on a project-nested route is 403 in enforce for a project it does not own", async () => {
    const { enforce } = await projectNestedUnderModes(
      orgAuth,
      foreignProjectId,
    );
    expect(enforce).toMatchObject({ validKey: false, status: 403 });
  });

  it("a project key on a project-nested route 403s in both modes", async () => {
    const { legacy, enforce } = await projectNestedUnderModes(
      projectAuth,
      projectId,
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
