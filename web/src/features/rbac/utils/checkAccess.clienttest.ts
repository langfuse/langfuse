// @vitest-environment node

import { hasOrganizationAccess } from "./checkOrganizationAccess";
import { hasProjectAccess } from "./checkProjectAccess";
import { type Role } from "@langfuse/shared/src/db";
import { OrganizationId, ProjectId, SystemRoleId } from "@langfuse/shared/rbac";
import { createSession } from "@/src/__tests__/fixtures/session-factory";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import { type Policy } from "@/src/features/rbac/types";

function projectSession(projectId: string, role: Role) {
  return createSession({
    organizations: [{ id: "org-1", role, projects: [{ id: projectId }] }],
  });
}

function readPolicy(tenant: string, project: string): Policy {
  return {
    id: "system/OWNER:project",
    tenantId: OrganizationId(tenant),
    roleId: SystemRoleId("OWNER"),
    effect: "ALLOW",
    actions: ["prompts:read"],
    resources: [ProjectId(project)],
  };
}

function apiKeyContext(): AuthorizationContext {
  return {
    principal: {
      kind: "apiKey",
      apiKeyId: "key-1",
      userId: null,
      isInAppAgentKey: false,
      publicKey: "pk-lf-1",
      scope: "ORGANIZATION",
      presentation: "privateKey",
      organizations: [
        {
          orgId: "org-1",
          organizationCreatedAt: "2026-01-01T00:00:00.000Z",
          plan: "oss",
          rateLimitOverrides: [],
          projectIds: ["project-1", "project-2"],
          isIngestionSuspended: false,
        },
      ],
      boundResource: { orgId: "org-1" },
    },
    policies: [[readPolicy("org-1", "project-1")]],
  };
}

function adminContext(): AuthorizationContext {
  return {
    principal: { kind: "admin" },
    policies: [[readPolicy("*", "*")]],
  };
}

describe("RBAC access checks", () => {
  it("authorizes an authorization context in the project's tenant", () => {
    const canRead = (ctx: AuthorizationContext, projectId: string) =>
      hasProjectAccess({ ctx, projectId, scope: "prompts:read" });

    expect(canRead(apiKeyContext(), "project-1")).toBe(true);
    expect(canRead(apiKeyContext(), "project-2")).toBe(false);
    expect(canRead(apiKeyContext(), "project-other-org")).toBe(false);
    expect(canRead(adminContext(), "project-other-org")).toBe(true);
  });

  it("allows organization members to invoke the gateway", () => {
    const canInvoke = (role: Role) =>
      hasOrganizationAccess({
        session: createSession({ organizations: [{ id: "org-1", role }] }),
        organizationId: "org-1",
        scope: "gateway:invoke",
      });

    for (const role of ["OWNER", "ADMIN", "MEMBER"] as const) {
      expect(canInvoke(role)).toBe(true);
    }
    for (const role of ["VIEWER", "NONE"] as const) {
      expect(canInvoke(role)).toBe(false);
    }
  });

  it("allows members to manage llm tools", () => {
    expect(
      hasProjectAccess({
        session: projectSession("project-1", "MEMBER"),
        projectId: "project-1",
        scope: "llmTools:CUD",
      }),
    ).toBe(true);
  });

  it("preserves normal project LLM permissions", () => {
    const projectId = "project-1";
    expect(
      hasProjectAccess({
        session: projectSession(projectId, "MEMBER"),
        projectId,
        scope: "playground:execute",
      }),
    ).toBe(true);
  });
});
