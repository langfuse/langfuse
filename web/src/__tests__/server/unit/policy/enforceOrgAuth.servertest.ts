import { describe, expect, it } from "vitest";

import { InvalidRequestError } from "@langfuse/shared";

import { __test } from "@/src/features/auth/policy/enforceOrgAuth";
import {
  type AuthorizationContext,
  type Resource,
} from "@/src/features/auth/policy/types";

const { getOrgId } = __test;

const orgIdHeader = "x-langfuse-organization-id";

const ORG = "org_1";

const apiKey = (
  apiKeyId: string,
  boundResource: Resource,
): AuthorizationContext => ({
  principal: {
    kind: "apiKey",
    apiKeyId,
    userId: null,
    isInAppAgentKey: false,
    publicKey: "pk-lf-1",
    scope: "orgId" in boundResource ? "ORGANIZATION" : "PROJECT",
    presentation: "privateKey",
    organizations: [],
    boundResource,
  },
  policies: [],
});

const orgKey = () => apiKey("key_1", { orgId: ORG });

const projectKey = () => apiKey("key_2", { projectId: "prj_1" });

describe("getOrgId", () => {
  it("resolves the bound org without a header", () => {
    expect(getOrgId(orgKey(), {})).toEqual({ success: true, orgId: ORG });
  });
  it("resolves an unbound principal from the header", () => {
    expect(getOrgId(projectKey(), { [orgIdHeader]: ORG })).toEqual({
      success: true,
      orgId: ORG,
    });
  });
  it("400s a header disagreeing with the bound org", () => {
    expect(getOrgId(orgKey(), { [orgIdHeader]: "org_2" })).toMatchObject({
      success: false,
      error: expect.any(InvalidRequestError),
    });
  });
  it("400s when neither header nor bound org exists", () => {
    expect(getOrgId(projectKey(), {})).toMatchObject({
      success: false,
      error: expect.any(InvalidRequestError),
    });
  });
});
