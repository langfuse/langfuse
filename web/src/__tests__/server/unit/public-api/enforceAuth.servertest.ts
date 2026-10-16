import { type NextApiRequest } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { addUserToSpan, instrumentAsync } from "@langfuse/shared/src/server";

import { authenticator } from "@/src/features/apiKey/server";
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

vi.mock("@/src/features/apiKey/server", () => ({
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

describe("getOrgId", () => {
  it("resolves the bound org without a header", () => {
    expect(getOrgId(orgKey(), req())).toEqual({ success: true, orgId: ORG });
  });
  it("resolves a project-scoped key to its own organization", () => {
    expect(getOrgId(projectKey(), req())).toEqual({
      success: true,
      orgId: ORG,
    });
  });
  it.each(["x-langfuse-organization-id", "langfuse-organization-id"])(
    "403s %s disagreeing with the bound org",
    (orgIdHeader) => {
      expect(
        getOrgId(orgKey(), req({}, { [orgIdHeader]: "org_2" })),
      ).toMatchObject({ success: false, error: expect.any(ForbiddenError) });
    },
  );
  it("prefers the X-prefixed organization header when both are provided", () => {
    expect(
      getOrgId(
        orgKey(),
        req(
          {},
          {
            "x-langfuse-organization-id": ORG,
            "langfuse-organization-id": "org_2",
          },
        ),
      ),
    ).toEqual({ success: true, orgId: ORG });
  });
  it("403s a principal carrying no binding", () => {
    expect(getOrgId(adminKey(), req())).toMatchObject({
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
    it("ignores a header disagreeing with the bound project", () => {
      expect(
        getProjectId(projectKey(), req({}, { [projectIdHeader]: "prj_2" })),
      ).toEqual({ success: true, projectId: PRJ });
    });
    it("403s a bound key whose path names another project", () => {
      expect(
        getProjectId(
          projectKey(),
          req({ projectId: "prj_2" }, {}, "/api/public/projects/prj_2/apiKeys"),
        ),
      ).toMatchObject({ success: false, error: expect.any(ForbiddenError) });
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
            { [projectIdHeader]: "prj_3" },
            "/api/public/ingestion?projectId=llm-app",
          ),
        ),
      ).toEqual({ success: true, projectId: PRJ });
    });
    it("prefers the URL project over a conflicting header", () => {
      expect(
        getProjectId(
          orgKey(),
          req({ projectId: PRJ }, { [projectIdHeader]: "prj_2" }),
        ),
      ).toEqual({ success: true, projectId: PRJ });
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
      expect(getProjectId(orgKey(), req())).toMatchObject({
        success: false,
        error: expect.any(ForbiddenError),
      });
    });
  },
);

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
        {
          "x-langfuse-project-id": "ignored-header-project",
          authorization: "Bearer untrusted-submitted-credential",
        },
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
    ["URL", { projectId: PRJ }, { "x-langfuse-project-id": "ignored" }],
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

  it.each([false, true])(
    "records organization resolution with header conflict %s",
    async (conflict) => {
      vi.mocked(authenticator.authenticate).mockResolvedValue({
        success: true,
        context: orgKey(),
      });
      vi.mocked(authorize).mockReturnValue(forbiddenError());
      expect(
        await enforceAuth({
          req: req(
            {},
            { "x-langfuse-organization-id": conflict ? "foreign" : ORG },
          ),
          action: "projects:read",
        }),
      ).toMatchObject({ success: false });
      expect(authSpan.setAttribute.mock.calls).toEqual([
        ["langfuse.authz.action", "projects:read"],
        ["langfuse.api_key.id", "key_1"],
        ["langfuse.api_key.public_key", "pk-lf-1"],
        ...(conflict ? [] : [["langfuse.org.id", ORG]]),
      ]);
    },
  );

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
