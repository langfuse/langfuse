import { describe, expect, it } from "vitest";

import { InvalidRequestError } from "@langfuse/shared";

import { __test } from "@/src/features/auth/policy/enforceOrgAuth";
import {
  type AuthorizationContext,
  type BoundResource,
} from "@/src/features/auth/policy/types";

const { getOrgId } = __test;

const orgIdHeader = "x-langfuse-organization-id";

const ORG = "org_1";

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

const projectKey = () =>
  apiKey("key_2", { orgId: "org_2", projectId: "prj_1" });

const adminKey = (): AuthorizationContext => ({
  principal: { kind: "admin", userId: null },
  policies: [],
});

describe("getOrgId", () => {
  it("resolves the bound org without a header", () => {
    expect(getOrgId(orgKey(), {})).toEqual({ success: true, orgId: ORG });
  });
  it("resolves a project-scoped key to its own organization", () => {
    expect(getOrgId(projectKey(), {})).toEqual({
      success: true,
      orgId: "org_2",
    });
  });
  it("400s a header disagreeing with the bound org", () => {
    expect(getOrgId(orgKey(), { [orgIdHeader]: "org_2" })).toMatchObject({
      success: false,
      error: expect.any(InvalidRequestError),
    });
  });
  it("400s a principal carrying no binding", () => {
    expect(getOrgId(adminKey(), {})).toMatchObject({
      success: false,
      error: expect.any(InvalidRequestError),
    });
  });
});
