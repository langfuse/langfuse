import { hasOrganizationAccess } from "./checkOrganizationAccess";
import { hasProjectAccess } from "./checkProjectAccess";

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
});
