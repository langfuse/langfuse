import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import {
  resolveOrganizationScopes,
  resolveProjectRole,
  resolveProjectScopes,
  type GroupRoleGrant,
} from "./userProjectRoleAuth";
import { organizationRoleAccessRights } from "../../features/rbac/organizationAccessRights";
import { projectRoleAccessRights } from "../../features/rbac/projectAccessRights";

const projectMemberships = [{ projectId: "locked", role: Role.VIEWER }];
const orgAdmin: GroupRoleGrant = { projectId: null, role: Role.ADMIN };
const analyticsAdmin: GroupRoleGrant = {
  projectId: "analytics",
  role: Role.ADMIN,
};

const projectScopes = (projectId: string, groupRoles: GroupRoleGrant[]) =>
  resolveProjectScopes({
    projectId,
    projectMemberships,
    orgMembershipRole: Role.MEMBER,
    groupRoles,
  });

const sorted = <T>(list: T[] | undefined) => [...(list ?? [])].sort();

describe("resolveProjectRole", () => {
  it("uses the project role if set, else the org role", () => {
    const role = (projectId: string) =>
      resolveProjectRole({
        projectId,
        projectMemberships,
        orgMembershipRole: Role.MEMBER,
      });
    expect(role("locked")).toBe(Role.VIEWER);
    expect(role("other")).toBe(Role.MEMBER);
  });
});

describe("resolveProjectScopes", () => {
  it("is undefined when no group applies", () => {
    expect(projectScopes("other", [])).toBeUndefined();
    expect(projectScopes("other", [analyticsAdmin])).toBeUndefined();
  });

  it("adds a project grant on its project", () => {
    expect(sorted(projectScopes("analytics", [analyticsAdmin]))).toEqual(
      sorted(projectRoleAccessRights[Role.ADMIN]),
    );
  });

  it("adds org-wide grants on every project, even a locked-down one", () => {
    expect(sorted(projectScopes("locked", [orgAdmin]))).toEqual(
      sorted(projectRoleAccessRights[Role.ADMIN]),
    );
  });

  it("never lowers the direct role", () => {
    const viewer = { projectId: "analytics", role: Role.VIEWER };
    expect(projectScopes("analytics", [viewer])).toEqual(
      expect.arrayContaining(projectRoleAccessRights[Role.MEMBER]),
    );
  });
});

describe("resolveOrganizationScopes", () => {
  it("is undefined without org-wide grants", () => {
    expect(
      resolveOrganizationScopes({
        orgMembershipRole: Role.MEMBER,
        groupRoles: [analyticsAdmin],
      }),
    ).toBeUndefined();
  });

  it("adds org-wide grants to the direct role", () => {
    expect(
      sorted(
        resolveOrganizationScopes({
          orgMembershipRole: Role.MEMBER,
          groupRoles: [orgAdmin],
        }),
      ),
    ).toEqual(sorted(organizationRoleAccessRights[Role.ADMIN]));
  });
});
