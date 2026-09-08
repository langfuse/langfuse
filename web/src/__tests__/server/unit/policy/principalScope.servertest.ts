import { describe, expect, it } from "vitest";

import { InternalServerError } from "@langfuse/shared";

import { principalScope } from "@/src/features/auth/policy/principalScope";
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

describe("principalScope on an org target", () => {
  it("maps the key and its organization onto the organization scope", async () => {
    expect(
      await principalScope(apiKey("ORGANIZATION"), { orgId: "org_1" }),
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
      await principalScope(apiKey("ORGANIZATION"), { orgId: "org_2" }),
    ).toMatchObject({ success: false, error: expect.any(InternalServerError) });
  });

  it("500s a non-api-key principal", async () => {
    expect(await principalScope(admin, { orgId: "org_1" })).toMatchObject({
      success: false,
      error: expect.any(InternalServerError),
    });
  });
});

describe("principalScope on a project target", () => {
  it("maps the key and its organization onto the project scope", async () => {
    expect(
      await principalScope(apiKey("PROJECT"), { projectId: "prj_1" }),
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
    const result = await principalScope(apiKey("PROJECT", "publicKey"), {
      projectId: "prj_1",
    });
    expect(result).toMatchObject({ success: true });
    if (result.success) expect(result.scope.accessLevel).toBe("scores");
  });

  it("500s an org-scoped key that reached the project mapper", async () => {
    expect(
      await principalScope(apiKey("ORGANIZATION"), { projectId: "prj_1" }),
    ).toMatchObject({ success: false, error: expect.any(InternalServerError) });
  });
});
