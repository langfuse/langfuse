import { describe, expect, it } from "vitest";

import { InternalServerError } from "@langfuse/shared";

import { toApiAccessScope } from "@/src/features/public-api/server/toApiAccessScope";
import { type Principal } from "@/src/features/auth/policy/types";

const scopeOrg = {
  orgId: "org_1",
  plan: "oss" as const,
  rateLimitOverrides: [],
  projectIds: ["prj_1"],
  isIngestionSuspended: false,
};

const apiKeyPrincipal = (
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

describe("toApiAccessScope", () => {
  it("maps an api key and its organization onto the organization scope", () => {
    expect(
      toApiAccessScope(apiKeyPrincipal("ORGANIZATION"), {
        orgId: "org_1",
        projectId: null,
      }),
    ).toEqual({
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

  it("maps an api key and its organization onto the project scope", () => {
    expect(
      toApiAccessScope(apiKeyPrincipal("PROJECT"), {
        orgId: "org_1",
        projectId: "prj_1",
      }),
    ).toEqual(projectScope);
  });

  it("maps a public-key presentation to the scores access level", () => {
    expect(
      toApiAccessScope(apiKeyPrincipal("PROJECT", "publicKey"), {
        orgId: "org_1",
        projectId: "prj_1",
      }).accessLevel,
    ).toBe("scores");
  });

  it("maps an admin principal onto the self-host admin scope", () => {
    expect(
      toApiAccessScope(
        { kind: "admin", userId: null },
        { orgId: "org_1", projectId: "prj_1" },
      ),
    ).toEqual({
      projectId: "prj_1",
      accessLevel: "project",
      orgId: "org_1",
      plan: "oss",
      rateLimitOverrides: [],
      apiKeyId: "ADMIN_API_KEY",
      publicKey: "ADMIN_API_KEY",
      isIngestionSuspended: false,
      isInAppAgentKey: false,
    });
  });

  it("500s an unmappable principal kind", () => {
    expect(() =>
      toApiAccessScope(
        { kind: "user", userId: "u_1", organizations: [] },
        { orgId: "org_1", projectId: null },
      ),
    ).toThrow(InternalServerError);
  });
});
