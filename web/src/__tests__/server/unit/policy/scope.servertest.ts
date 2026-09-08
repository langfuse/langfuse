import { describe, expect, it } from "vitest";

import { ForbiddenError, InternalServerError } from "@langfuse/shared";

import {
  accessLevelOf,
  orgScope,
  projectScope,
  requireAccessLevel,
} from "@/src/features/auth/policy/scope";
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
    scope === "ORGANIZATION" ? { orgId: "org_1" } : { projectId: "prj_1" },
});

const admin: Principal = { kind: "admin", userId: null };

describe("accessLevelOf", () => {
  it("reads a basic-auth organization key as organization", () => {
    expect(accessLevelOf(apiKey("ORGANIZATION"))).toBe("organization");
  });

  it("reads a basic-auth project key as project", () => {
    expect(accessLevelOf(apiKey("PROJECT"))).toBe("project");
  });

  it("reads a bearer-presented key as scores", () => {
    expect(accessLevelOf(apiKey("PROJECT", "publicKey"))).toBe("scores");
  });

  it("gives the admin credential no access level", () => {
    expect(accessLevelOf(admin)).toBeUndefined();
  });
});

describe("requireAccessLevel", () => {
  it("admits the required access level", () => {
    expect(
      requireAccessLevel(apiKey("ORGANIZATION"), "organization"),
    ).toBeNull();
  });

  it("403s a project key on an organization route", () => {
    expect(requireAccessLevel(apiKey("PROJECT"), "organization")).toMatchObject(
      { success: false, error: expect.any(ForbiddenError) },
    );
  });

  it("403s an organization key on a project route", () => {
    expect(requireAccessLevel(apiKey("ORGANIZATION"), "project")).toMatchObject(
      { success: false, error: expect.any(ForbiddenError) },
    );
  });

  it("403s a bearer-presented key on a project route", () => {
    expect(
      requireAccessLevel(apiKey("PROJECT", "publicKey"), "project"),
    ).toMatchObject({ success: false, error: expect.any(ForbiddenError) });
  });

  it("403s the admin credential", () => {
    expect(requireAccessLevel(admin, "organization")).toMatchObject({
      success: false,
      error: expect.any(ForbiddenError),
    });
  });

  it("admits anything when the route requires no access level", () => {
    expect(requireAccessLevel(admin, undefined)).toBeNull();
  });
});

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
