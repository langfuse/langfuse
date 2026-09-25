import { describe, expect, it } from "vitest";

import { prisma } from "@langfuse/shared/src/db";
import {
  createAndAddApiKeysToDb,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

import { apiKeyAccessRights } from "@/src/features/rbac/constants/apiKeyAccessRights";
import { getRolesForPrincipal } from "@/src/features/rbac/getRolesForPrincipal";
import { ApiKeyId } from "@/src/features/rbac/types";

// Decision-equivalence: resolving policies from system-role assignments must
// yield exactly what `apiKeyAccessRights[scope]` bound to the same resources
// produced before the resolver read from assignments.
describe("getRolesForPrincipal decision-equivalence", () => {
  it("a PROJECT key resolves to the project policy bound to its project", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const key = await createAndAddApiKeysToDb({
      prisma,
      entityId: projectId,
      scope: "PROJECT",
    });

    const policies = (await getRolesForPrincipal(ApiKeyId(key.id))).flatMap(
      (role) => role.policies,
    );

    expect(policies).toEqual(
      apiKeyAccessRights.PROJECT.map((p) => ({ ...p, resources: [projectId] })),
    );
  });

  it("an ORGANIZATION key resolves to the org policy plus its project policy over the org's projects", async () => {
    const { projectId, orgId } = await createOrgProjectAndApiKey();
    const key = await createAndAddApiKeysToDb({
      prisma,
      entityId: orgId,
      scope: "ORGANIZATION",
    });

    const policies = (await getRolesForPrincipal(ApiKeyId(key.id))).flatMap(
      (role) => role.policies,
    );

    expect(policies).toEqual(
      apiKeyAccessRights.ORGANIZATION.map((p) => ({
        ...p,
        resources: p.kind === "organization" ? [orgId] : [projectId],
      })),
    );
  });
});
