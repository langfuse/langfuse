import { describe, expect, it } from "vitest";

import { InternalServerError } from "@langfuse/shared";

import { orgScope, projectScope } from "@/src/features/auth/policy/scope";
import { type Principal } from "@/src/features/auth/policy/types";

const organization = {
  orgId: "org_1",
  plan: "oss" as const,
  rateLimitOverrides: [],
  projectIds: ["prj_1"],
  isIngestionSuspended: false,
};

const apiKey = (
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
  organizations: [organization],
  boundResource:
    scope === "ORGANIZATION"
      ? { orgId: "org_1" }
      : { orgId: "org_1", projectId: "prj_1" },
});

const admin: Principal = { kind: "admin", userId: null };

describe("orgScope", () => {
  it("maps the key and its organization onto the organization scope", () => {
    expect(orgScope(apiKey("ORGANIZATION"), "org_1")).toEqual({
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

  it("500s a target the principal does not carry", () => {
    expect(orgScope(apiKey("ORGANIZATION"), "org_2")).toMatchObject({
      success: false,
      error: expect.any(InternalServerError),
    });
  });

  it("500s a non-api-key principal", () => {
    expect(orgScope(admin, "org_1")).toMatchObject({
      success: false,
      error: expect.any(InternalServerError),
    });
  });
});

describe("projectScope", () => {
  it("maps the key and its organization onto the project scope", () => {
    expect(projectScope(apiKey("PROJECT"), "prj_1")).toEqual({
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

  it("500s a non-api-key principal", () => {
    expect(projectScope(admin, "prj_1")).toMatchObject({
      success: false,
      error: expect.any(InternalServerError),
    });
  });
});
