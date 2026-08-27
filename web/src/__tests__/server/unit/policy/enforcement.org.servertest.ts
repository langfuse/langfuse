import { describe, expect, it } from "vitest";

import { InvalidRequestError } from "@langfuse/shared";

import { __test } from "@/src/features/auth/policy/enforcement.org";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";

const { getOrgId } = __test;

const orgIdHeader = "x-langfuse-organization-id";

const ORG = "org_1";

const orgKey = (): AuthorizationContext => ({
  principal: {
    kind: "apiKey",
    apiKeyId: "key_1",
    userId: null,
    organizations: [],
    boundResource: { orgId: ORG },
  },
  policies: [],
});

const projectKey = (): AuthorizationContext => ({
  principal: {
    kind: "apiKey",
    apiKeyId: "key_2",
    userId: null,
    organizations: [],
    boundResource: { projectId: "prj_1" },
  },
  policies: [],
});

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
