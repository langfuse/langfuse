// @vitest-environment node

import { hasOrganizationAccess } from "./checkOrganizationAccess";
import { hasProjectAccess } from "./checkProjectAccess";
import { type ProjectScope } from "@langfuse/shared";
import { type Role } from "@langfuse/shared/src/db";
import { type Session } from "next-auth";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { createSession } from "@/src/__tests__/fixtures/session-factory";

vi.mock("@/src/env.mjs", () => ({
  env: { NEXT_PUBLIC_DEMO_PROJECT_ID: "demo-project" },
}));

function projectSession(
  projectId: string,
  role: Role,
  user: Partial<Omit<NonNullable<Session["user"]>, "organizations">> = {},
) {
  return createSession({
    user: { email: "user@example.com", ...user },
    organizations: [{ id: "org-1", role, projects: [{ id: projectId }] }],
  });
}

describe("RBAC access checks", () => {
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

  it("requires Internal view for demo LLM operations even with project OWNER role", () => {
    const projectId = "demo-project";
    const session = projectSession(projectId, "OWNER");
    const paidScopes: ProjectScope[] = [
      "playground:execute",
      "topics:CUD",
      "evaluator:CUD",
      "evaluationRule:CUD",
      "promptExperiments:CUD",
      "evalDefaultModel:CUD",
      "llmApiKeys:create",
      "llmApiKeys:update",
    ];
    for (const scope of paidScopes) {
      expect(hasProjectAccess({ session, projectId, scope }), scope).toBe(
        false,
      );
      expect(
        hasProjectAccess({
          session: projectSession(projectId, "OWNER", {
            email: "staff@langfuse.com",
          }),
          projectId,
          scope,
        }),
        scope,
      ).toBe(true);
    }
  });

  it("requires project permissions for internal demo users", () => {
    const projectId = "demo-project";
    const user = { email: "staff@clickhouse.com" };
    const session = projectSession(projectId, "MEMBER", user);
    for (const scope of ["playground:execute", "topics:CUD"] as const) {
      expect(hasProjectAccess({ session, projectId, scope }), scope).toBe(true);
      expect(
        hasProjectAccess({
          session: projectSession(projectId, "VIEWER", user),
          projectId,
          scope,
        }),
        scope,
      ).toBe(false);
      expect(
        hasProjectAccess({
          session: projectSession("another-project", "MEMBER", user),
          projectId,
          scope,
        }),
        scope,
      ).toBe(false);
    }
    for (const scope of ["llmApiKeys:create", "llmApiKeys:update"] as const) {
      expect(hasProjectAccess({ session, projectId, scope }), scope).toBe(
        false,
      );
    }
  });

  it("blocks demo LLM operations in External view even with a Topics grant", () => {
    const projectId = "demo-project";
    const session = projectSession(projectId, "MEMBER", {
      email: "staff@langfuse.com",
      featureFlags: testFeatureFlags({
        internalFeatures: false,
        langfuseTopics: true,
      }),
    });
    for (const scope of ["playground:execute", "topics:CUD"] as const) {
      expect(hasProjectAccess({ session, projectId, scope }), scope).toBe(
        false,
      );
    }
  });

  it("preserves demo viewer read access", () => {
    const projectId = "demo-project";
    const session = projectSession(projectId, "VIEWER");
    for (const scope of ["topics:read", "llmApiKeys:read"] as const) {
      expect(hasProjectAccess({ session, projectId, scope }), scope).toBe(true);
    }
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
