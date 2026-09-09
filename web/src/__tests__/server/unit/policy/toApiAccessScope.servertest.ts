import { describe, expect, it } from "vitest";

import { InternalServerError } from "@langfuse/shared";

import { toApiAccessScope } from "@/src/features/auth/policy/toApiAccessScope";
import {
  type AuthorizationContext,
  type Principal,
} from "@/src/features/auth/policy/types";

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

const ctx = (principal: Principal): AuthorizationContext => ({
  principal,
  policies: [],
});

describe("toApiAccessScope on an org target", () => {
  it("maps the key and its organization onto the organization scope", async () => {
    expect(
      await toApiAccessScope(ctx(apiKey("ORGANIZATION")), { orgId: "org_1" }),
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
      await toApiAccessScope(ctx(apiKey("ORGANIZATION")), { orgId: "org_2" }),
    ).toMatchObject({ success: false, error: expect.any(InternalServerError) });
  });

  it("500s a non-api-key principal", async () => {
    expect(
      await toApiAccessScope(ctx(admin), { orgId: "org_1" }),
    ).toMatchObject({
      success: false,
      error: expect.any(InternalServerError),
    });
  });
});

describe("toApiAccessScope on a project target", () => {
  it("maps the key and its organization onto the project scope", async () => {
    expect(
      await toApiAccessScope(ctx(apiKey("PROJECT")), { projectId: "prj_1" }),
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
    const result = await toApiAccessScope(ctx(apiKey("PROJECT", "publicKey")), {
      projectId: "prj_1",
    });
    expect(result).toMatchObject({ success: true });
    if (result.success) expect(result.scope.accessLevel).toBe("scores");
  });

  it("maps an org-scoped key onto the project scope of a project it owns", async () => {
    expect(
      await toApiAccessScope(ctx(apiKey("ORGANIZATION")), {
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
