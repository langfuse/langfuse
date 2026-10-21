import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import {
  resolveOrganizationRole,
  resolveProjectRole,
  type GroupRoleGrant,
} from "./userProjectRoleAuth";

// John from the RFC example: org MEMBER, locked down to VIEWER on payments-prod,
// in group `platform` (org ADMIN) and `ml-team` (VIEWER on analytics).
const projectMemberships = [{ projectId: "payments-prod", role: Role.VIEWER }];
const platform: GroupRoleGrant = { projectId: null, role: Role.ADMIN };
const mlTeam: GroupRoleGrant = { projectId: "analytics", role: Role.VIEWER };

const projectRole = (projectId: string, groupRoles: GroupRoleGrant[]) =>
  resolveProjectRole({
    projectId,
    projectMemberships,
    orgMembershipRole: Role.MEMBER,
    groupRoles,
  });

describe("resolveProjectRole", () => {
  it("keeps today's rule without groups: a direct project role replaces the org role", () => {
    expect(projectRole("payments-prod", [])).toBe(Role.VIEWER);
    expect(projectRole("other", [])).toBe(Role.MEMBER);
  });

  it("adds group roles on top of direct roles, org-wide grants included", () => {
    expect(projectRole("payments-prod", [platform, mlTeam])).toBe(Role.ADMIN);
    expect(projectRole("analytics", [platform, mlTeam])).toBe(Role.ADMIN);
    expect(projectRole("other", [platform, mlTeam])).toBe(Role.ADMIN);
  });

  it("never lets a group lower access", () => {
    expect(projectRole("analytics", [mlTeam])).toBe(Role.MEMBER);
  });

  it("applies a group's project grant only to that project", () => {
    const grant = { projectId: "analytics", role: Role.ADMIN };
    expect(projectRole("analytics", [grant])).toBe(Role.ADMIN);
    expect(projectRole("other", [grant])).toBe(Role.MEMBER);
  });

  it("raises an org NONE member through a group", () => {
    expect(
      resolveProjectRole({
        projectId: "analytics",
        projectMemberships: [],
        orgMembershipRole: Role.NONE,
        groupRoles: [mlTeam],
      }),
    ).toBe(Role.VIEWER);
  });
});

describe("resolveOrganizationRole", () => {
  it("takes the highest of the direct org role and org-wide group roles", () => {
    expect(
      resolveOrganizationRole({
        orgMembershipRole: Role.MEMBER,
        groupRoles: [platform, mlTeam],
      }),
    ).toBe(Role.ADMIN);
  });

  it("ignores project grants and never lowers the direct role", () => {
    expect(
      resolveOrganizationRole({
        orgMembershipRole: Role.OWNER,
        groupRoles: [platform, { projectId: "analytics", role: Role.ADMIN }],
      }),
    ).toBe(Role.OWNER);
    expect(
      resolveOrganizationRole({
        orgMembershipRole: Role.NONE,
        groupRoles: [mlTeam],
      }),
    ).toBe(Role.NONE);
  });
});
