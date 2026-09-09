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
import { authorize } from "@/src/features/auth/policy/authorize";
import { type ShadowAuthParams } from "@/src/features/public-api/server/shadowAuth";
import {
  type AuthorizationContext,
  type OrganizationAction,
  type ProjectAction,
} from "@/src/features/auth/policy/types";

// The seam is imported dynamically so the authenticator singleton captures
// the admin key set in beforeAll.

type ShadowResult =
  | { success: true; scope: Record<string, unknown> }
  | { success: false; error: { httpCode: number; message: string } };

type ShadowAuth = (params: ShadowAuthParams) => Promise<ShadowResult>;

type Authenticator = {
  authenticate: (params: {
    headers: { authorization: string };
  }) => Promise<
    { success: true; context: AuthorizationContext } | { success: false }
  >;
};

const adminApiKey = "test-admin-api-key-direct-enforce-scope";

let shadowAuth: ShadowAuth;
let authenticator: Authenticator;
let orgId = "";
let projectId = "";
let foreignProjectId = "";
let orgAuth = "";
let projectAuth = "";
let projectPublicKey = "";

let originalMigration: string | undefined;
let originalAdminApiKey: string | undefined;

const reqWith = (
  headers: Record<string, string | undefined>,
  query: Record<string, string> = {},
): NextApiRequest =>
  ({ headers, method: "GET", query }) as unknown as NextApiRequest;

const setMode = (mode: string) => {
  (env as any).API_AUTH_MIGRATION = mode;
};

const dropScopeKey = ({
  scope: _apiKeyScope,
  ...rest
}: Record<string, unknown>) => rest;

const orgResultUnderModes = async (
  authorization: string,
  action: OrganizationAction = "projects:read",
) => {
  const params: ShadowAuthParams = {
    req: reqWith({ authorization }),
    action,
    allowedAccessLevels: ["organization"],
  };
  setMode("legacy");
  const legacy = await shadowAuth(params);
  setMode("enforce");
  const enforce = await shadowAuth(params);
  return { legacy, enforce };
};

const projectResultUnderModes = async (
  authorization: string,
  target?: string,
) => {
  const params: ShadowAuthParams = {
    req: reqWith({ authorization, "x-langfuse-project-id": target }),
    action: "project:read",
    allowedAccessLevels: ["project"],
  };
  setMode("legacy");
  const legacy = await shadowAuth(params);
  setMode("enforce");
  const enforce = await shadowAuth(params);
  return { legacy, enforce };
};

const projectNestedUnderModes = async (
  authorization: string,
  target: string,
  action: ProjectAction = "apiKeys:read",
) => {
  const params: ShadowAuthParams = {
    req: reqWith({ authorization }, { projectId: target }),
    action,
    allowedAccessLevels: ["organization"],
  };
  setMode("legacy");
  const legacy = await shadowAuth(params);
  setMode("enforce");
  const enforce = await shadowAuth(params);
  return { legacy, enforce };
};

const scopeOf = (result: ShadowResult): Record<string, unknown> => {
  if (!result.success) throw new Error(`denied with ${result.error.httpCode}`);
  return result.scope;
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

const createOrgWithoutProjects = async () => {
  const org = await prisma.organization.create({
    data: { id: randomUUID(), name: randomUUID() },
  });
  return { orgId: org.id, auth: await createOrgApiKey(org.id) };
};

const contextFor = async (
  authorization: string,
): Promise<AuthorizationContext> => {
  const authn = await authenticator.authenticate({
    headers: { authorization },
  });
  if (!authn.success) throw new Error("authentication failed");
  return authn.context;
};

const ownedProjectIds = (context: AuthorizationContext): string[] =>
  context.principal.kind === "apiKey"
    ? context.principal.organizations.flatMap((o) => o.projectIds)
    : [];

describe("shadowAuth maps principals to legacy-identical scopes", () => {
  beforeAll(async () => {
    originalMigration = (env as any).API_AUTH_MIGRATION;
    originalAdminApiKey = (env as any).ADMIN_API_KEY;
    (env as any).ADMIN_API_KEY = adminApiKey;

    ({ shadowAuth } =
      (await import("@/src/features/public-api/server/shadowAuth")) as unknown as {
        shadowAuth: ShadowAuth;
      });
    ({ authenticator } =
      (await import("@/src/features/apiKey/authenticator")) as unknown as {
        authenticator: Authenticator;
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
      expect(legacy).toMatchObject({
        success: false,
        error: { httpCode: 403 },
      });
      expect(enforce).toMatchObject({
        success: false,
        error: { httpCode: 403 },
      });
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
    expect(legacy).toMatchObject({ success: false, error: { httpCode: 403 } });
    expect(enforce).toMatchObject({ success: false, error: { httpCode: 403 } });
  });

  it("an organization key naming a project it owns is 403 in legacy and authorized in enforce", async () => {
    const { legacy, enforce } = await projectResultUnderModes(
      orgAuth,
      projectId,
    );
    expect(legacy).toMatchObject({ success: false, error: { httpCode: 403 } });
    expect(scopeOf(enforce).accessLevel).toBe("project");
    expect(scopeOf(enforce).projectId).toBe(projectId);
    expect(scopeOf(enforce).orgId).toBe(orgId);
  });

  it("an organization key naming no project 403s in both modes", async () => {
    const { legacy, enforce } = await projectResultUnderModes(orgAuth);
    expect(legacy).toMatchObject({ success: false, error: { httpCode: 403 } });
    expect(enforce).toMatchObject({ success: false, error: { httpCode: 403 } });
  });

  it("a bearer-presented project key on a project route 403s in both modes", async () => {
    const { legacy, enforce } = await projectResultUnderModes(
      `Bearer ${projectPublicKey}`,
    );
    expect(legacy).toMatchObject({ success: false, error: { httpCode: 403 } });
    expect(enforce).toMatchObject({ success: false, error: { httpCode: 403 } });
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
    expect(enforce).toMatchObject({ success: false, error: { httpCode: 403 } });
  });

  it("a project key on a project-nested route 403s in both modes", async () => {
    const { legacy, enforce } = await projectNestedUnderModes(
      projectAuth,
      projectId,
    );
    expect(legacy).toMatchObject({ success: false, error: { httpCode: 403 } });
    expect(enforce).toMatchObject({ success: false, error: { httpCode: 403 } });
  });

  it("an organization key is granted project:read on a project it owns", async () => {
    const context = await contextFor(orgAuth);
    expect(ownedProjectIds(context)).toContain(projectId);
    expect(authorize(context, "project:read", { projectId }).success).toBe(
      true,
    );
  });

  it("an organization key is denied project:read on a project it does not own", async () => {
    const context = await contextFor(orgAuth);
    expect(
      authorize(context, "project:read", { projectId: foreignProjectId })
        .success,
    ).toBe(false);
  });

  it("an organization with no projects exposes no project ids to the per-project gate", async () => {
    const { auth } = await createOrgWithoutProjects();
    expect(ownedProjectIds(await contextFor(auth))).toEqual([]);
  });

  it("the admin key is refused on both dispatch families in both modes", async () => {
    const admin = `Bearer ${adminApiKey}`;
    const org = await orgResultUnderModes(admin);
    const project = await projectResultUnderModes(admin);
    expect(org.legacy).toMatchObject({
      success: false,
      error: { httpCode: 401 },
    });
    expect(org.enforce).toMatchObject({
      success: false,
      error: { httpCode: 401 },
    });
    expect(project.legacy).toMatchObject({
      success: false,
      error: { httpCode: 401 },
    });
    expect(project.enforce).toMatchObject({
      success: false,
      error: { httpCode: 401 },
    });
  });
});
