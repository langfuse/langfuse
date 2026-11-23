// @vitest-environment node

import { hasOrganizationAccess } from "./checkOrganizationAccess";
import { hasProjectAccess } from "./checkProjectAccess";
import { type Role } from "@langfuse/shared/src/db";
import { createSession } from "@/src/__tests__/fixtures/session-factory";

function projectSession(projectId: string, role: Role) {
  return createSession({
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
