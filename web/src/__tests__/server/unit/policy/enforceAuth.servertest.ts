import { type NextApiRequest } from "next";
import { describe, expect, it } from "vitest";

import {
  ForbiddenError,
  InternalServerError,
  InvalidRequestError,
} from "@langfuse/shared";

import { __test } from "@/src/features/public-api/server/enforceAuth";
import {
  type AuthorizationContext,
  type BoundResource,
  type Principal,
} from "@/src/features/auth/policy/types";

const { getOrgId, getProjectId, toApiAccessScope } = __test;

const orgIdHeader = "x-langfuse-organization-id";
const projectIdHeader = "x-langfuse-project-id";

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
    organizations: [],
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

const req = (query = {}, headers = {}) =>
  ({ query, headers }) as unknown as NextApiRequest;

describe("getOrgId", () => {
  it("resolves the bound org without a header", () => {
    expect(getOrgId(orgKey(), {})).toEqual({ success: true, orgId: ORG });
  });
  it("resolves a project-scoped key to its own organization", () => {
    expect(getOrgId(projectKey(), {})).toEqual({ success: true, orgId: ORG });
  });
  it("400s a header disagreeing with the bound org", () => {
    expect(getOrgId(orgKey(), { [orgIdHeader]: "org_2" })).toMatchObject({
      success: false,
      error: expect.any(InvalidRequestError),
    });
  });
  it("403s a principal carrying no binding", () => {
    expect(getOrgId(adminKey(), {})).toMatchObject({
      success: false,
      error: expect.any(ForbiddenError),
    });
  });
});

describe("getProjectId", () => {
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
    expect(getProjectId(orgKey(), req({}, { [projectIdHeader]: PRJ }))).toEqual(
      { success: true, projectId: PRJ },
    );
  });
  it("resolves the URL projectId ahead of header and bound", () => {
    expect(
      getProjectId(
        projectKey(),
        req({ projectId: "prj_url" }, { [projectIdHeader]: "prj_hdr" }),
      ),
    ).toEqual({ success: true, projectId: "prj_url" });
  });
  it("400s a header disagreeing with the bound project", () => {
    expect(
      getProjectId(projectKey(), req({}, { [projectIdHeader]: "prj_2" })),
    ).toMatchObject({ success: false, error: expect.any(InvalidRequestError) });
  });
  it("403s when neither URL, header, nor bound project exists", () => {
    expect(getProjectId(orgKey(), req())).toMatchObject({
      success: false,
      error: expect.any(ForbiddenError),
    });
  });
});

const scopeOrg = {
  orgId: "org_1",
  plan: "oss" as const,
  rateLimitOverrides: [],
  projectIds: ["prj_1"],
  isIngestionSuspended: false,
};

const scopeApiKey = (
  scope: "ORGANIZATION" | "PROJECT",
  presentation: "privateKey" | "publicKey" = "privateKey",
): Principal => ({
  kind: "apiKey",
  apiKeyId: "key_1",
  userId: null,
  isInAppAgentKey: false,
  publicKey: "pk-lf-1",
  scope,
  presentation,
  organizations: [scopeOrg],
  boundResource:
    scope === "ORGANIZATION"
      ? { orgId: "org_1" }
      : { orgId: "org_1", projectId: "prj_1" },
});

const scopeAdmin: Principal = { kind: "admin", userId: null };

const scopeCtx = (principal: Principal): AuthorizationContext => ({
  principal,
  policies: [],
});

describe("toApiAccessScope on an org target", () => {
  it("maps the key and its organization onto the organization scope", async () => {
    expect(
      await toApiAccessScope(scopeCtx(scopeApiKey("ORGANIZATION")), {
        orgId: "org_1",
      }),
    ).toEqual({
      success: true,
      scope: {
        projectId: null,
        accessLevel: "organization",
        orgId: "org_1",
        plan: "oss",
        rateLimitOverrides: [],
        apiKeyId: "key_1",
        publicKey: "pk-lf-1",
        isIngestionSuspended: false,
        isInAppAgentKey: false,
      },
    });
  });

  it("500s a target the principal does not carry", async () => {
    expect(
      await toApiAccessScope(scopeCtx(scopeApiKey("ORGANIZATION")), {
        orgId: "org_2",
      }),
    ).toMatchObject({ success: false, error: expect.any(InternalServerError) });
  });

  it("500s a non-api-key principal", async () => {
    expect(
      await toApiAccessScope(scopeCtx(scopeAdmin), { orgId: "org_1" }),
    ).toMatchObject({
      success: false,
      error: expect.any(InternalServerError),
    });
  });
});

describe("toApiAccessScope on a project target", () => {
  it("maps the key and its organization onto the project scope", async () => {
    expect(
      await toApiAccessScope(scopeCtx(scopeApiKey("PROJECT")), {
        projectId: "prj_1",
      }),
    ).toEqual({
      success: true,
      scope: {
        projectId: "prj_1",
        accessLevel: "project",
        orgId: "org_1",
        plan: "oss",
        rateLimitOverrides: [],
        apiKeyId: "key_1",
        publicKey: "pk-lf-1",
        isIngestionSuspended: false,
        isInAppAgentKey: false,
      },
    });
  });

  it("maps a public-key presentation to the scores access level", async () => {
    const result = await toApiAccessScope(
      scopeCtx(scopeApiKey("PROJECT", "publicKey")),
      { projectId: "prj_1" },
    );
    expect(result).toMatchObject({ success: true });
    if (result.success) expect(result.scope.accessLevel).toBe("scores");
  });

  it("maps an org-scoped key onto the project scope of a project it owns", async () => {
    expect(
      await toApiAccessScope(scopeCtx(scopeApiKey("ORGANIZATION")), {
        projectId: "prj_1",
      }),
    ).toEqual({
      success: true,
      scope: {
        projectId: "prj_1",
        accessLevel: "project",
        orgId: "org_1",
        plan: "oss",
        rateLimitOverrides: [],
        apiKeyId: "key_1",
        publicKey: "pk-lf-1",
        isIngestionSuspended: false,
        isInAppAgentKey: false,
      },
    });
  });
});
