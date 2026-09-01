import { describe, expect, it } from "vitest";

import { InvalidRequestError } from "@langfuse/shared";

import { __test } from "@/src/features/auth/policy/enforcement.projects";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";

const { getProjectId } = __test;

const projectIdHeader = "x-langfuse-project-id";

const PRJ = "prj_1";

const projectKey = (): AuthorizationContext => ({
  principal: {
    kind: "apiKey",
    apiKeyId: "key_1",
    userId: null,
    isInAppAgentKey: false,
    organizations: [],
    boundResource: { projectId: PRJ },
  },
  policies: [],
});

const orgKey = (): AuthorizationContext => ({
  principal: {
    kind: "apiKey",
    apiKeyId: "key_2",
    userId: null,
    isInAppAgentKey: false,
    organizations: [],
    boundResource: { orgId: "org_1" },
  },
  policies: [],
});

describe("getProjectId", () => {
  it("resolves the bound project without a header", () => {
    expect(getProjectId(projectKey(), {})).toEqual({
      success: true,
      projectId: PRJ,
    });
  });
  it("resolves an unbound principal from the header", () => {
    expect(getProjectId(orgKey(), { [projectIdHeader]: PRJ })).toEqual({
      success: true,
      projectId: PRJ,
    });
  });
  it("400s a header disagreeing with the bound project", () => {
    expect(
      getProjectId(projectKey(), { [projectIdHeader]: "prj_2" }),
    ).toMatchObject({ success: false, error: expect.any(InvalidRequestError) });
  });
  it("400s when neither header nor bound project exists", () => {
    expect(getProjectId(orgKey(), {})).toMatchObject({
      success: false,
      error: expect.any(InvalidRequestError),
    });
  });
});
