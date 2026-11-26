import { type NextApiRequest } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ForbiddenError,
  InvalidRequestError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { addUserToSpan, instrumentAsync } from "@langfuse/shared/src/server";

import { authenticator } from "@/src/features/apiKey/authenticator";
import { authorize } from "@/src/features/rbac/authorize";
import {
  __dangerouslySkipAuthz,
  __test,
  enforceAuth,
} from "@/src/features/public-api/server/enforceAuth";
import {
  forbiddenError,
  unauthorizedError,
  type AuthorizationContext,
  type BoundResource,
} from "@/src/features/auth/policy/types";

const { authSpan } = vi.hoisted(() => ({
  authSpan: { setAttribute: vi.fn() },
}));

vi.mock("@/src/features/apiKey/authenticator", () => ({
  authenticator: { authenticate: vi.fn() },
}));
vi.mock("@/src/features/rbac/authorize", () => ({ authorize: vi.fn() }));
vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { project: { findUnique: vi.fn() }, $disconnect: vi.fn() },
}));
vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<{
    addUserToSpan: typeof addUserToSpan;
  }>();
  return {
    addUserToSpan: vi.fn(actual.addUserToSpan),
    instrumentAsync: vi.fn(async (_ctx, callback) => callback(authSpan)),
    redis: null,
    ClickHouseClientManager: {
      getInstance: () => ({ closeAllConnections: vi.fn() }),
    },
  };
});

const { getOrgId, getProjectId } = __test;

const ORG = "org_1";
const PRJ = "prj_1";

const apiKey = (
  apiKeyId: string,
  boundResource: BoundResource,
  accessAuditLogEnabled = false,
): AuthorizationContext => ({
  principal: {
    kind: "apiKey",
    apiKeyId,
    userId: null,
    isInAppAgentKey: false,
    publicKey: "pk-lf-1",
    scope: boundResource.projectId ? "PROJECT" : "ORGANIZATION",
    presentation: "privateKey",
    organizations: [
      {
        orgId: ORG,
        projectIds: [PRJ],
        organizationCreatedAt: "2026-01-01T00:00:00.000Z",
        plan: "oss",
        rateLimitOverrides: [],
        isIngestionSuspended: false,
        accessAuditLogEnabled,
      },
    ],
    boundResource,
  },
  policies: [],
});

const orgKey = () => apiKey("key_1", { orgId: ORG });
const projectKey = () => apiKey("key_2", { orgId: ORG, projectId: PRJ });

const adminKey = (): AuthorizationContext => ({
  principal: { kind: "admin", userId: null },
  policies: [],
});

const req = (query = {}, headers = {}, url?: string) =>
  ({ query, headers, url }) as unknown as NextApiRequest;

const basic = (username: string) => ({
  authorization: `Basic ${btoa(`${username}:sk-lf-1`)}`,
});

const rejected = (
  error: typeof ForbiddenError | typeof InvalidRequestError,
  message: string,
) => ({
  success: false,
  error: expect.objectContaining({ constructor: error, message }),
});

const forbidden = (message: string) => rejected(ForbiddenError, message);

const invalidRequest = (message: string) =>
  rejected(InvalidRequestError, message);

describe("getOrgId", () => {
  it("resolves the bound org", () => {
    expect(getOrgId(orgKey())).toEqual({ success: true, orgId: ORG });
  });
  it("resolves a project-scoped key to its own organization", () => {
    expect(getOrgId(projectKey())).toEqual({
      success: true,
      orgId: ORG,
    });
  });
  it("403s a principal carrying no binding", () => {
    expect(getOrgId(adminKey())).toMatchObject({
      success: false,
      error: expect.any(ForbiddenError),
    });
  });
});

describe.each(["x-langfuse-project-id", "langfuse-project-id"])(
  "getProjectId with %s",
  (projectIdHeader) => {
    it("resolves the bound project without a header", () => {
      expect(getProjectId(projectKey(), req())).toEqual({
        success: true,
        projectId: PRJ,
      });
    });
    it("resolves the bound project when the header is blank", () => {
      expect(
        getProjectId(projectKey(), req({}, { [projectIdHeader]: "" })),
      ).toEqual({ success: true, projectId: PRJ });
    });
    it("resolves an unbound principal from the header", () => {
      expect(
        getProjectId(orgKey(), req({}, { [projectIdHeader]: PRJ })),
      ).toEqual({
        success: true,
        projectId: PRJ,
      });
    });
    it("resolves when URL, header, and bound project agree", () => {
      expect(
        getProjectId(
          projectKey(),
          req({ projectId: PRJ }, { [projectIdHeader]: PRJ }),
        ),
      ).toEqual({ success: true, projectId: PRJ });
    });
    it("resolves a header agreeing with the bound project", () => {
      expect(
        getProjectId(projectKey(), req({}, { [projectIdHeader]: PRJ })),
      ).toEqual({ success: true, projectId: PRJ });
    });
    it("403s a header disagreeing with the bound project", () => {
      const result = getProjectId(
        projectKey(),
        req({}, { [projectIdHeader]: "prj_2" }),
      );
      expect(result).toMatchObject({
        success: false,
        error: expect.any(ForbiddenError),
      });
      expect(!result.success && result.error.message).toBe(
        "The API Key is not authorized to access project 'prj_2'",
      );
    });
    it("403s a bound key whose path names another project", () => {
      const result = getProjectId(
        projectKey(),
        req({ projectId: "prj_2" }, {}, "/api/public/projects/prj_2/apiKeys"),
      );
      expect(result).toMatchObject({
        success: false,
        error: expect.any(ForbiddenError),
      });
      expect(!result.success && result.error.message).toBe(
        "The API Key is not authorized to access project 'prj_2'",
      );
    });
    it("403s a bound key whose percent-encoded path names another project", () => {
      expect(
        getProjectId(
          projectKey(),
          req(
            { projectId: "prj_2" },
            {},
            "/api/public/projects/%70rj_2/apiKeys",
          ),
        ),
      ).toMatchObject({ success: false, error: expect.any(ForbiddenError) });
    });
    it("403s a bound key whose URL project disagrees when the path is unknown", () => {
      expect(
        getProjectId(projectKey(), req({ projectId: "prj_2" })),
      ).toMatchObject({ success: false, error: expect.any(ForbiddenError) });
    });
    it("ignores a query-string project disagreeing with the bound project", () => {
      expect(
        getProjectId(
          projectKey(),
          req(
            { projectId: "llm-app" },
            {},
            "/api/public/ingestion?projectId=llm-app",
          ),
        ),
      ).toEqual({ success: true, projectId: PRJ });
    });
    it("prefers the path project over the header for an unbound key", () => {
      expect(
        getProjectId(
          orgKey(),
          req(
            { projectId: PRJ },
            { [projectIdHeader]: "prj_2" },
            `/api/public/projects/${PRJ}/apiKeys`,
          ),
        ),
      ).toEqual({ success: true, projectId: PRJ });
    });
    it("prefers the path project over the Basic auth username for an unbound key", () => {
      expect(
        getProjectId(
          orgKey(),
          req(
            { projectId: PRJ },
            basic("prj_2"),
            `/api/public/projects/${PRJ}/apiKeys`,
          ),
        ),
      ).toEqual({ success: true, projectId: PRJ });
    });
    it("prefers the path project over the header for a bound key", () => {
      expect(
        getProjectId(
          projectKey(),
          req(
            { projectId: PRJ },
            { [projectIdHeader]: "prj_2" },
            `/api/public/projects/${PRJ}/apiKeys`,
          ),
        ),
      ).toEqual({ success: true, projectId: PRJ });
    });
    it("prefers the header over a query-string project", () => {
      expect(
        getProjectId(
          orgKey(),
          req(
            { projectId: "llm-app" },
            { [projectIdHeader]: PRJ },
            "/api/public/ingestion?projectId=llm-app",
          ),
        ),
      ).toEqual({ success: true, projectId: PRJ });
    });
    it("falls back to a query-string project when nothing else names one", () => {
      expect(
        getProjectId(
          orgKey(),
          req({ projectId: PRJ }, {}, `/api/public/traces?projectId=${PRJ}`),
        ),
      ).toEqual({ success: true, projectId: PRJ });
    });
    it("resolves an unbound key from a Basic auth username", () => {
      expect(getProjectId(orgKey(), req({}, basic(PRJ)))).toEqual({
        success: true,
        projectId: PRJ,
      });
    });
    it("ignores a public-key Basic auth username", () => {
      expect(getProjectId(orgKey(), req({}, basic("pk-lf-1")))).toMatchObject({
        success: false,
        error: expect.any(ForbiddenError),
      });
    });
    it("ignores a Basic auth username that is the key's own unprefixed public key", () => {
      const key = projectKey();
      if (key.principal.kind === "apiKey") key.principal.publicKey = "pk-1";
      expect(getProjectId(key, req({}, basic("pk-1")))).toEqual({
        success: true,
        projectId: PRJ,
      });
    });
    it("resolves a Basic auth username agreeing with the bound project", () => {
      expect(getProjectId(projectKey(), req({}, basic(PRJ)))).toEqual({
        success: true,
        projectId: PRJ,
      });
    });
    it("403s a Basic auth username disagreeing with the bound project", () => {
      expect(getProjectId(projectKey(), req({}, basic("prj_2")))).toMatchObject(
        forbidden("The API Key is not authorized to access project 'prj_2'"),
      );
    });
    it("resolves when the Basic auth username and header agree", () => {
      expect(
        getProjectId(
          orgKey(),
          req({}, { ...basic(PRJ), [projectIdHeader]: PRJ }),
        ),
      ).toEqual({ success: true, projectId: PRJ });
    });
    it("400s when the Basic auth username and header disagree", () => {
      expect(
        getProjectId(
          orgKey(),
          req({}, { ...basic(PRJ), [projectIdHeader]: "prj_2" }),
        ),
      ).toMatchObject(
        invalidRequest(
          "Project ids from the 'langfuse-project-id' header and authorization header disagree",
        ),
      );
    });
    it("prefers the X-prefixed header when both are provided", () => {
      expect(
        getProjectId(
          orgKey(),
          req(
            {},
            {
              "x-langfuse-project-id": PRJ,
              "langfuse-project-id": "prj_2",
            },
          ),
        ),
      ).toEqual({ success: true, projectId: PRJ });
    });
    it("403s when neither URL, header, nor bound project exists", () => {
      const result = getProjectId(orgKey(), req());
      expect(result).toMatchObject({
        success: false,
        error: expect.any(ForbiddenError),
      });
      expect(!result.success && result.error.message).toBe(
        "Multi-project API keys require the 'langfuse-project-id' header to select a project",
      );
    });
  },
);

describe("enforceAuth access-audit opt-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorize).mockReturnValue({ success: true });
  });

  it.each([
    ["organization", apiKey("key_1", { orgId: ORG }, true), "projects:read"],
    [
      "project",
      apiKey("key_2", { orgId: ORG, projectId: PRJ }, true),
      "traces:read",
    ],
  ] as const)(
    "carries the %s key's org opt-in onto the scope",
    async (_kind, context, action) => {
      vi.mocked(authenticator.authenticate).mockResolvedValue({
        success: true,
        context,
      });
      expect(await enforceAuth({ req: req(), action })).toMatchObject({
        success: true,
        scope: { accessAuditLogEnabled: true },
      });
    },
  );

  it("leaves the opt-in unresolved for the admin key, which carries no org", async () => {
    vi.mocked(authenticator.authenticate).mockResolvedValue({
      success: true,
      context: adminKey(),
    });
    vi.mocked(prisma.project.findUnique).mockResolvedValue({
      orgId: ORG,
    } as Awaited<ReturnType<typeof prisma.project.findUnique>>);
    expect(
      await enforceAuth({
        req: req({}, { "x-langfuse-project-id": PRJ }),
        action: "traces:read",
        isAdminApiKeyAuthAllowed: true,
      }),
    ).toMatchObject({ success: true, scope: { accessAuditLogEnabled: null } });
  });
});

describe("enforceAuth span metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticator.authenticate).mockResolvedValue({
      success: true,
      context: projectKey(),
    });
    vi.mocked(authorize).mockReturnValue({ success: true });
  });

  it("retains the authenticated key and resolved targets when authorization denies access", async () => {
    const denial = forbiddenError();
    vi.mocked(authorize).mockReturnValue(denial);
    const result = await enforceAuth({
      req: req(
        { projectId: "ignored-url-project" },
        { authorization: "Bearer untrusted-submitted-credential" },
        "/api/public/traces?projectId=ignored-url-project",
      ),
      action: "traces:read",
    });
    expect(result).toBe(denial);
    expect(instrumentAsync).toHaveBeenCalledWith(
      { name: "api-auth-enforce" },
      expect.any(Function),
    );
    expect(addUserToSpan).toHaveBeenNthCalledWith(
      1,
      { apiKeyId: "key_2", publicKey: "pk-lf-1" },
      authSpan,
    );
    expect(authSpan.setAttribute.mock.calls).toEqual([
      ["langfuse.authz.action", "traces:read"],
      ["langfuse.api_key.id", "key_2"],
      ["langfuse.api_key.public_key", "pk-lf-1"],
      ["langfuse.project.id", PRJ],
      ["langfuse.project.size", "unknown"],
      ["langfuse.org.id", ORG],
    ]);
  });

  it("records only the action when authentication fails", async () => {
    const failure = unauthorizedError();
    vi.mocked(authenticator.authenticate).mockResolvedValue(failure);
    expect(await enforceAuth({ req: req(), action: "traces:read" })).toBe(
      failure,
    );
    expect(addUserToSpan).not.toHaveBeenCalled();
    expect(authSpan.setAttribute.mock.calls).toEqual([
      ["langfuse.authz.action", "traces:read"],
    ]);
  });

  it.each([
    ["URL", { projectId: PRJ }, {}],
    ["header", {}, { "x-langfuse-project-id": PRJ }],
  ])(
    "records an organization key's %s project target",
    async (_source, query, headers) => {
      vi.mocked(authenticator.authenticate).mockResolvedValue({
        success: true,
        context: orgKey(),
      });
      const result = await enforceAuth({
        req: req(query, headers),
        action: "traces:read",
      });
      expect(result.success).toBe(true);
      expect(authSpan.setAttribute.mock.calls).toEqual([
        ["langfuse.authz.action", "traces:read"],
        ["langfuse.api_key.id", "key_1"],
        ["langfuse.api_key.public_key", "pk-lf-1"],
        ["langfuse.project.id", PRJ],
        ["langfuse.project.size", "unknown"],
        ["langfuse.org.id", ORG],
      ]);
    },
  );

  it("retains a foreign project target without inventing a resolved organization", async () => {
    vi.mocked(authenticator.authenticate).mockResolvedValue({
      success: true,
      context: orgKey(),
    });
    expect(
      await enforceAuth({
        req: req({ projectId: "foreign" }),
        action: "traces:read",
      }),
    ).toMatchObject({
      success: false,
      error: expect.any(LangfuseNotFoundError),
    });
    expect(addUserToSpan).toHaveBeenNthCalledWith(
      1,
      { apiKeyId: "key_1", publicKey: "pk-lf-1" },
      authSpan,
    );
    expect(authSpan.setAttribute.mock.calls).toEqual([
      ["langfuse.authz.action", "traces:read"],
      ["langfuse.api_key.id", "key_1"],
      ["langfuse.api_key.public_key", "pk-lf-1"],
      ["langfuse.project.id", "foreign"],
      ["langfuse.project.size", "unknown"],
    ]);
  });

  it("omits unresolved targets when an organization key has no project", async () => {
    vi.mocked(authenticator.authenticate).mockResolvedValue({
      success: true,
      context: orgKey(),
    });
    expect(
      await enforceAuth({ req: req(), action: "traces:read" }),
    ).toMatchObject({ success: false });
    expect(authSpan.setAttribute.mock.calls).toEqual([
      ["langfuse.authz.action", "traces:read"],
      ["langfuse.api_key.id", "key_1"],
      ["langfuse.api_key.public_key", "pk-lf-1"],
    ]);
  });

  it("records the bound organization when authorization denies an org action", async () => {
    vi.mocked(authenticator.authenticate).mockResolvedValue({
      success: true,
      context: orgKey(),
    });
    vi.mocked(authorize).mockReturnValue(forbiddenError());
    expect(
      await enforceAuth({ req: req(), action: "projects:read" }),
    ).toMatchObject({ success: false });
    expect(authSpan.setAttribute.mock.calls).toEqual([
      ["langfuse.authz.action", "projects:read"],
      ["langfuse.api_key.id", "key_1"],
      ["langfuse.api_key.public_key", "pk-lf-1"],
      ["langfuse.org.id", ORG],
    ]);
  });

  it("preserves the skip-authorization action", async () => {
    expect(
      await enforceAuth({ req: req(), action: __dangerouslySkipAuthz }),
    ).toMatchObject({ success: true });
    expect(authorize).not.toHaveBeenCalled();
    expect(authSpan.setAttribute.mock.calls).toEqual([
      ["langfuse.authz.action", __dangerouslySkipAuthz],
      ["langfuse.api_key.id", "key_2"],
      ["langfuse.api_key.public_key", "pk-lf-1"],
      ["langfuse.project.id", PRJ],
      ["langfuse.project.size", "unknown"],
      ["langfuse.org.id", ORG],
    ]);
  });

  it.each([false, true])(
    "records admin targets without API key metadata when project missing is %s",
    async (missing) => {
      vi.mocked(authenticator.authenticate).mockResolvedValue({
        success: true,
        context: adminKey(),
      });
      vi.mocked(prisma.project.findUnique).mockResolvedValue(
        missing
          ? null
          : ({ orgId: ORG } as Awaited<
              ReturnType<typeof prisma.project.findUnique>
            >),
      );
      const result = await enforceAuth({
        req: req({}, { "x-langfuse-project-id": PRJ }),
        action: "traces:read",
        isAdminApiKeyAuthAllowed: true,
      });
      expect(result.success).toBe(!missing);
      const expectedMetadata: unknown[] = [[{ projectId: PRJ }, authSpan]];
      if (!missing) expectedMetadata.push([{ orgId: ORG }, authSpan]);
      expect(vi.mocked(addUserToSpan).mock.calls).toEqual(expectedMetadata);
      expect(authSpan.setAttribute.mock.calls).toEqual([
        ["langfuse.authz.action", "traces:read"],
        ["langfuse.project.id", PRJ],
        ["langfuse.project.size", "unknown"],
        ...(missing ? [] : [["langfuse.org.id", ORG]]),
      ]);
    },
  );
});
