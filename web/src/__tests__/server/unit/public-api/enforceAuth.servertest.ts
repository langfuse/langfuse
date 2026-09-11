import { type NextApiRequest } from "next";
import { describe, expect, it } from "vitest";

import { ForbiddenError, InvalidRequestError } from "@langfuse/shared";

import { __test } from "@/src/features/public-api/server/enforceAuth";
import {
  type AuthorizationContext,
  type BoundResource,
  type Principal,
} from "@/src/features/auth/policy/types";

const { getOrgId, getProjectId, apiKeyScope } = __test;

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
    expect(getOrgId(orgKey(), req())).toEqual({ success: true, orgId: ORG });
  });
  it("resolves a project-scoped key to its own organization", () => {
    expect(getOrgId(projectKey(), req())).toEqual({
      success: true,
      orgId: ORG,
    });
  });
  it("resolves a header disagreeing with the bound org, leaving the denial to the policy", () => {
    expect(getOrgId(orgKey(), req({}, { [orgIdHeader]: "org_2" }))).toEqual({
      success: true,
      orgId: "org_2",
    });
  });
  it("403s a principal carrying no binding", () => {
    expect(getOrgId(adminKey(), req())).toMatchObject({
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
      {
        success: true,
        projectId: PRJ,
      },
    );
  });
  it("resolves when URL, header, and bound project agree", () => {
    expect(
      getProjectId(
        projectKey(),
        req({ projectId: PRJ }, { [projectIdHeader]: PRJ }),
      ),
    ).toEqual({ success: true, projectId: PRJ });
  });
  it("resolves a header disagreeing with the bound project, leaving the denial to the policy", () => {
    expect(
      getProjectId(projectKey(), req({}, { [projectIdHeader]: "prj_2" })),
    ).toEqual({ success: true, projectId: "prj_2" });
  });
  it("resolves a URL disagreeing with the bound project, leaving the denial to the policy", () => {
    expect(getProjectId(projectKey(), req({ projectId: "prj_2" }))).toEqual({
      success: true,
      projectId: "prj_2",
    });
  });
  it("400s a URL disagreeing with the header", () => {
    expect(
      getProjectId(
        orgKey(),
        req({ projectId: PRJ }, { [projectIdHeader]: "prj_2" }),
      ),
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
): Extract<Principal, { kind: "apiKey" }> => ({
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

const projectScope = {
  projectId: "prj_1",
  accessLevel: "project",
  orgId: "org_1",
  plan: "oss",
  rateLimitOverrides: [],
  apiKeyId: "key_1",
  publicKey: "pk-lf-1",
  isIngestionSuspended: false,
  isInAppAgentKey: false,
};

describe("apiKeyScope", () => {
  it("maps the key and its organization onto the organization scope", () => {
    expect(apiKeyScope(scopeApiKey("ORGANIZATION"), "org_1", null)).toEqual({
      projectId: null,
      accessLevel: "organization",
      orgId: "org_1",
      plan: "oss",
      rateLimitOverrides: [],
      apiKeyId: "key_1",
      publicKey: "pk-lf-1",
      isIngestionSuspended: false,
      isInAppAgentKey: false,
    });
  });

  it("maps the key and its organization onto the project scope", () => {
    expect(apiKeyScope(scopeApiKey("PROJECT"), "org_1", "prj_1")).toEqual(
      projectScope,
    );
  });

  it("maps a public-key presentation to the scores access level", () => {
    expect(
      apiKeyScope(scopeApiKey("PROJECT", "publicKey"), "org_1", "prj_1")
        .accessLevel,
    ).toBe("scores");
  });

  it("maps an org-scoped key onto the project scope of a project it owns", () => {
    expect(apiKeyScope(scopeApiKey("ORGANIZATION"), "org_1", "prj_1")).toEqual(
      projectScope,
    );
  });
});
