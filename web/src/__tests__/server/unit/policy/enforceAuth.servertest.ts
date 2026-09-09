import { type NextApiRequest } from "next";
import { describe, expect, it } from "vitest";

import { ForbiddenError, InvalidRequestError } from "@langfuse/shared";

import { __test } from "@/src/features/auth/policy/enforceAuth";
import {
  type AuthorizationContext,
  type BoundResource,
} from "@/src/features/auth/policy/types";

const { getOrgId, getProjectId } = __test;

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
