import { describe, expect, it } from "vitest";

import { randomUUID } from "crypto";

import { prisma } from "@langfuse/shared/src/db";
import { assignRole } from "@langfuse/shared/rbac/server";
import {
  createApiKey,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

import {
  allOrganizationActions,
  allProjectActions,
  ApiKeyId,
  OrganizationId,
  ProjectId,
  systemRoleAccessRights,
  SystemRoleId,
  UserId,
} from "@langfuse/shared/rbac";

import { getRolesForPrincipal } from "@/src/features/rbac/getRolesForPrincipal";

// Decision-equivalence: resolving policies from system-role assignments must
// yield the catalog grants bound to the same tenant and resources the key
// covered before the resolver read from assignments.
describe("getRolesForPrincipal decision-equivalence", () => {
  it.each(
    Object.values(systemRoleAccessRights).flatMap(({ id }) =>
      (["organization", "project"] as const).map((ownerKind) => ({
        systemRole: id,
        ownerKind,
      })),
    ),
  )(
    "$systemRole on a $ownerKind returns policies with matching action and resource kinds",
    async ({ systemRole, ownerKind }) => {
      const { orgId, projectId } = await createOrgProjectAndApiKey();
      const user = await prisma.user.create({
        data: { email: `policy-kinds-${randomUUID()}@example.com` },
      });
      const principalId = UserId(user.id);
      await assignRole(prisma, {
        principalId,
        roleId: SystemRoleId(systemRole),
        tenantId: OrganizationId(orgId),
        ownerId:
          ownerKind === "organization"
            ? OrganizationId(orgId)
            : ProjectId(projectId),
        tags: [],
      });

      const roles = await getRolesForPrincipal(prisma, principalId);
      expect(roles).toHaveLength(1);
      for (const policy of roles[0].policies) {
        expect(policy.resources.length).toBeGreaterThan(0);
        const resourceKind = policy.resources[0].split("/")[0];
        expect(["organization", "project"]).toContain(resourceKind);
        expect(
          policy.resources.every((resource) =>
            resource.startsWith(`${resourceKind}/`),
          ),
        ).toBe(true);

        const allowedActions = new Set<string>(
          resourceKind === "organization"
            ? allOrganizationActions
            : allProjectActions,
        );
        for (const action of policy.actions) {
          expect(allowedActions.has(action), `${policy.id}: ${action}`).toBe(
            true,
          );
        }
      }
    },
  );

  it("keeps the same role scoped to each assignment's owner and tenant", async () => {
    const organization = await createOrgProjectAndApiKey();
    const project = await createOrgProjectAndApiKey();
    const user = await prisma.user.create({
      data: { email: `role-scope-${randomUUID()}@example.com` },
    });
    const principalId = UserId(user.id);
    const roleId = SystemRoleId("VIEWER");
    await assignRole(prisma, {
      principalId,
      roleId,
      tenantId: OrganizationId(organization.orgId),
      ownerId: OrganizationId(organization.orgId),
      tags: [],
    });
    await assignRole(prisma, {
      principalId,
      roleId,
      tenantId: OrganizationId(project.orgId),
      ownerId: ProjectId(project.projectId),
      tags: [],
    });

    const roles = await getRolesForPrincipal(prisma, principalId);
    expect(roles).toHaveLength(2);
    const organizationRole = roles.find(
      (role) => role.tenantId === OrganizationId(organization.orgId),
    );
    const projectRole = roles.find(
      (role) => role.tenantId === OrganizationId(project.orgId),
    );
    expect(organizationRole?.policies).toEqual(
      systemRoleAccessRights.VIEWER.policies.map((policy) => ({
        id: `${roleId}:${policy.resourceKind}`,
        roleId,
        tenantId: OrganizationId(organization.orgId),
        effect: policy.effect,
        actions: policy.actions,
        resources:
          policy.resourceKind === "organization"
            ? [OrganizationId(organization.orgId)]
            : [ProjectId("*")],
      })),
    );
    expect(projectRole?.policies).toEqual(
      systemRoleAccessRights.VIEWER.policies
        .filter((policy) => policy.resourceKind === "project")
        .map((policy) => ({
          id: `${roleId}:${policy.resourceKind}`,
          roleId,
          tenantId: OrganizationId(project.orgId),
          effect: policy.effect,
          actions: policy.actions,
          resources: [ProjectId(project.projectId)],
        })),
    );
  });

  it("a legacy project API key resolves to the project policy bound to its project", async () => {
    const { projectId, orgId } = await createOrgProjectAndApiKey();
    const creator = await prisma.user.create({
      data: { email: `apikey-creator-${randomUUID()}@example.com` },
    });
    const key = await createApiKey(prisma, {
      owner: ProjectId(projectId),
      role: SystemRoleId("LEGACY_PROJECT_API_KEY"),
      createdBy: UserId(creator.id),
    });

    const policies = (
      await getRolesForPrincipal(prisma, ApiKeyId(key.id))
    ).flatMap((role) => role.policies);

    expect(policies).toEqual(
      systemRoleAccessRights.LEGACY_PROJECT_API_KEY.policies.map((p) => ({
        id: `${SystemRoleId("LEGACY_PROJECT_API_KEY")}:${p.resourceKind}`,
        roleId: SystemRoleId("LEGACY_PROJECT_API_KEY"),
        tenantId: OrganizationId(orgId),
        effect: p.effect,
        actions: p.actions,
        resources: [ProjectId(projectId)],
      })),
    );
  });

  it("a legacy organization API key resolves to the org policy plus its project policy over the org's project wildcard", async () => {
    const { orgId } = await createOrgProjectAndApiKey();
    const creator = await prisma.user.create({
      data: { email: `apikey-creator-${randomUUID()}@example.com` },
    });
    const key = await createApiKey(prisma, {
      owner: OrganizationId(orgId),
      role: SystemRoleId("LEGACY_ORGANIZATION_API_KEY"),
      createdBy: UserId(creator.id),
    });

    const policies = (
      await getRolesForPrincipal(prisma, ApiKeyId(key.id))
    ).flatMap((role) => role.policies);

    expect(policies).toEqual(
      systemRoleAccessRights.LEGACY_ORGANIZATION_API_KEY.policies.map((p) => ({
        id: `${SystemRoleId("LEGACY_ORGANIZATION_API_KEY")}:${p.resourceKind}`,
        roleId: SystemRoleId("LEGACY_ORGANIZATION_API_KEY"),
        tenantId: OrganizationId(orgId),
        effect: p.effect,
        actions: p.actions,
        resources:
          p.resourceKind === "organization"
            ? [OrganizationId(orgId)]
            : [ProjectId("*")],
      })),
    );
  });
});
