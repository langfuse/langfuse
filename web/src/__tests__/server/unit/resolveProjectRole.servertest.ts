import { describe, expect, it } from "vitest";

import { Role, type ProjectMembership } from "@langfuse/shared/src/db";
import { resolveProjectRole } from "@langfuse/shared/src/server";

const projectId = "project-1";

const projectMembership = (role: Role): ProjectMembership => ({
  projectId,
  userId: "user-1",
  orgMembershipId: "org-membership-1",
  role,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("resolveProjectRole", () => {
  it("uses the project role over the org role", () => {
    expect(
      resolveProjectRole({
        projectId,
        projectMemberships: [projectMembership(Role.ADMIN)],
        orgMembershipRole: Role.VIEWER,
      }),
    ).toBe(Role.ADMIN);
  });

  it("falls back to the org role without a project membership", () => {
    expect(
      resolveProjectRole({
        projectId,
        projectMemberships: [],
        orgMembershipRole: Role.MEMBER,
      }),
    ).toBe(Role.MEMBER);
  });

  it("honors project roles of AI_GATEWAY org members", () => {
    expect(
      resolveProjectRole({
        projectId,
        projectMemberships: [projectMembership(Role.ADMIN)],
        orgMembershipRole: Role.AI_GATEWAY,
      }),
    ).toBe(Role.ADMIN);
  });
});
