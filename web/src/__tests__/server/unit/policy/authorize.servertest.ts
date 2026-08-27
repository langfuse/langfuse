import { describe, expect, it } from "vitest";

import { ForbiddenError } from "@langfuse/shared";

import { authorize } from "@/src/features/auth/policy/authorize";
import {
  allOrganizationActions,
  allProjectActions,
  wildcard,
  type AuthorizationContext,
  type Policy,
} from "@/src/features/auth/policy/types";

const ORG = "org_1";
const PRJ = "prj_1";
const OTHER_PRJ = "prj_2";

const allowProject = (
  actions: readonly string[],
  resources: Policy["resources"],
): Policy => ({
  kind: "project",
  source: { kind: "role", id: "OWNER" },
  actions: actions as never,
  resources,
  effect: "allow",
});
const allowOrg = (
  actions: readonly string[],
  resources: Policy["resources"],
): Policy => ({
  kind: "organization",
  source: { kind: "role", id: "OWNER" },
  actions: actions as never,
  resources,
  effect: "allow",
});
const denyProject = (
  actions: readonly string[],
  resources: Policy["resources"],
): Policy => ({
  kind: "project",
  source: { kind: "grant" },
  actions: actions as never,
  resources,
  effect: "deny",
});
const ctx = (policies: Policy[]): AuthorizationContext => ({
  principal: {
    kind: "apiKey",
    apiKeyId: "key_1",
    userId: null,
    organizations: [],
  },
  policies,
});

describe("authorize — project coverage", () => {
  const grant = ctx([allowProject(["prompts:read"], [PRJ])]);
  it.each([
    ["a grant covers its project", { projectId: PRJ }, true],
    ["a grant does not cover another project", { projectId: OTHER_PRJ }, false],
  ] as const)("%s", (_name, resource, expected) => {
    expect(authorize(grant, "prompts:read", resource).success).toBe(expected);
  });
  it("no project ref grants nothing", () => {
    const empty = ctx([allowProject(["prompts:read"], [])]);
    expect(authorize(empty, "prompts:read", { projectId: PRJ }).success).toBe(
      false,
    );
  });
});

describe("authorize — org-level actions", () => {
  const orgAdmin = ctx([allowOrg(["projects:create"], [ORG])]);
  it("an org ref covers org-level actions", () => {
    expect(authorize(orgAdmin, "projects:create", { orgId: ORG }).success).toBe(
      true,
    );
  });
  it("org grant does not leak to another org", () => {
    expect(
      authorize(orgAdmin, "projects:create", { orgId: "org_x" }).success,
    ).toBe(false);
  });
});

describe("authorize — kind-gating", () => {
  it("a project wildcard never satisfies an org action", () => {
    const projectWildcard = ctx([allowProject(["prompts:read"], wildcard)]);
    expect(
      authorize(projectWildcard, "projects:read", { orgId: ORG }).success,
    ).toBe(false);
  });
  it("an org wildcard never satisfies a project action", () => {
    const orgWildcard = ctx([allowOrg(["projects:read"], wildcard)]);
    expect(
      authorize(orgWildcard, "prompts:read", { projectId: PRJ }).success,
    ).toBe(false);
  });
  it("a project audit grant does not satisfy an org-level audit check", () => {
    const projectAudit = ctx([allowProject(["auditLogs:read"], [PRJ])]);
    expect(
      authorize(projectAudit, "auditLogs:read", { projectId: PRJ }).success,
    ).toBe(true);
    expect(
      authorize(projectAudit, "auditLogs:read", { orgId: ORG }).success,
    ).toBe(false);
  });
});

describe("authorize — admin wildcard", () => {
  const admin = ctx([
    allowOrg(allOrganizationActions, wildcard),
    allowProject(allProjectActions, wildcard),
  ]);
  it("admin allows any project action", () => {
    expect(authorize(admin, "prompts:read", { projectId: "y" }).success).toBe(
      true,
    );
  });
  it("admin allows any org action", () => {
    expect(authorize(admin, "projects:create", { orgId: "x" }).success).toBe(
      true,
    );
  });
});

describe("authorize — deny-overrides and deny-by-default", () => {
  it("denies by default when nothing matches", () => {
    expect(authorize(ctx([]), "prompts:read", { projectId: PRJ }).success).toBe(
      false,
    );
  });
  it("a matching deny beats a matching allow", () => {
    const suspended = ctx([
      allowProject(["traces:create"], [PRJ]),
      denyProject(["traces:create"], [PRJ]),
    ]);
    expect(
      authorize(suspended, "traces:create", { projectId: PRJ }).success,
    ).toBe(false);
  });
  it("a deny of the checked project beats an allow that also covers others", () => {
    const c = ctx([
      allowProject(["prompts:read"], [PRJ, OTHER_PRJ]),
      denyProject(["prompts:read"], [PRJ]),
    ]);
    expect(authorize(c, "prompts:read", { projectId: PRJ }).success).toBe(
      false,
    );
    expect(authorize(c, "prompts:read", { projectId: OTHER_PRJ }).success).toBe(
      true,
    );
  });
  it("a deny carries the generic Forbidden message", () => {
    const roleDeny = denyProject(["traces:create"], [PRJ]);
    const decision = authorize(ctx([roleDeny]), "traces:create", {
      projectId: PRJ,
    });
    expect(decision.error?.message).toBe(new ForbiddenError().message);
  });
});
