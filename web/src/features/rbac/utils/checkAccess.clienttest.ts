// @vitest-environment node

import { hasOrganizationAccess } from "./checkOrganizationAccess";
import { hasProjectAccess } from "./checkProjectAccess";
import { type ProjectScope } from "@langfuse/shared";
import { type Role } from "@langfuse/shared/src/db";
import { type Session } from "next-auth";

vi.mock("@/src/env.mjs", () => ({
  env: { NEXT_PUBLIC_DEMO_PROJECT_ID: "demo-project" },
}));

function projectSession(projectId: string, role: Role, admin = false) {
  return {
    user: {
      admin,
      organizations: [{ projects: [{ id: projectId, role }] }],
    },
  } as Session;
}

describe("RBAC access checks", () => {
  it("ignores inherited role/admin properties for organization access", () => {
    const params = Object.assign(
      Object.create({
        role: "OWNER",
        admin: true,
      }),
      {
        session: {
          user: {
            admin: false,
            organizations: [{ id: "org-1", role: "MEMBER" }],
          },
        },
        organizationId: "org-1",
        scope: "organizationMembers:CUD",
      },
    );

    expect(
      hasOrganizationAccess(
        params as Parameters<typeof hasOrganizationAccess>[0],
      ),
    ).toBe(false);
  });

  it("ignores inherited role/admin properties for project access", () => {
    const params = Object.assign(
      Object.create({
        role: "OWNER",
        admin: true,
      }),
      {
        session: {
          user: {
            admin: false,
            organizations: [
              {
                projects: [{ id: "project-1", role: "MEMBER" }],
              },
            ],
          },
        },
        projectId: "project-1",
        scope: "project:update",
      },
    );

    expect(
      hasProjectAccess(params as Parameters<typeof hasProjectAccess>[0]),
    ).toBe(false);
  });

  it("still supports own role-based checks", () => {
    expect(
      hasOrganizationAccess({
        role: "OWNER",
        scope: "organizationMembers:CUD",
      }),
    ).toBe(true);

    expect(
      hasProjectAccess({
        role: "ADMIN",
        scope: "project:update",
      }),
    ).toBe(true);
  });

  it("allows organization members to invoke the gateway", () => {
    for (const role of ["OWNER", "ADMIN", "MEMBER"] as const) {
      expect(hasOrganizationAccess({ role, scope: "gateway:invoke" })).toBe(
        true,
      );
    }

    for (const role of ["VIEWER", "NONE"] as const) {
      expect(hasOrganizationAccess({ role, scope: "gateway:invoke" })).toBe(
        false,
      );
    }
  });

  it("allows members to manage llm tools", () => {
    expect(
      hasProjectAccess({
        role: "MEMBER",
        scope: "llmTools:CUD",
      }),
    ).toBe(true);
  });

  it("reserves demo LLM operations for internal admins even with project OWNER role", () => {
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
          session: projectSession(projectId, "OWNER", true),
          projectId,
          scope,
        }),
        scope,
      ).toBe(true);
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
