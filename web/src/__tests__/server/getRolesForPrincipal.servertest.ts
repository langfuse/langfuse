import { describe, expect, it } from "vitest";

import { randomUUID } from "crypto";

import { prisma } from "@langfuse/shared/src/db";
import {
  createApiKey,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

import {
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
  it("a PROJECT key resolves to the project policy bound to its project", async () => {
    const { projectId, orgId } = await createOrgProjectAndApiKey();
    const creator = await prisma.user.create({
      data: { email: `apikey-creator-${randomUUID()}@example.com` },
    });
    const key = await createApiKey(prisma, {
      owner: ProjectId(projectId),
      role: SystemRoleId("PROJECT"),
      creator: UserId(creator.id),
    });

    const policies = (await getRolesForPrincipal(ApiKeyId(key.id))).flatMap(
      (role) => role.policies,
    );

    expect(policies).toEqual(
      systemRoleAccessRights.PROJECT.policies.map((p) => ({
        id: `${SystemRoleId("PROJECT")}:${p.resourceKind}`,
        roleId: SystemRoleId("PROJECT"),
        tenantId: OrganizationId(orgId),
        effect: p.effect,
        actions: p.actions,
        resources: [ProjectId(projectId)],
      })),
    );
  });

  it("an ORGANIZATION key resolves to the org policy plus its project policy over the org's project wildcard", async () => {
    const { orgId } = await createOrgProjectAndApiKey();
    const creator = await prisma.user.create({
      data: { email: `apikey-creator-${randomUUID()}@example.com` },
    });
    const key = await createApiKey(prisma, {
      owner: OrganizationId(orgId),
      role: SystemRoleId("ORGANIZATION"),
      creator: UserId(creator.id),
    });

    const policies = (await getRolesForPrincipal(ApiKeyId(key.id))).flatMap(
      (role) => role.policies,
    );

    expect(policies).toEqual(
      systemRoleAccessRights.ORGANIZATION.policies.map((p) => ({
        id: `${SystemRoleId("ORGANIZATION")}:${p.resourceKind}`,
        roleId: SystemRoleId("ORGANIZATION"),
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
