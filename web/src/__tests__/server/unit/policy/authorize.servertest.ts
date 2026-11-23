import { describe, expect, it } from "vitest";

import { ForbiddenError } from "@langfuse/shared";
import {
  ApiKeyId,
  GroupId,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  UserId,
  hasOrganizationKind,
  hasProjectKind,
  systemRoleAccessRights,
  type PrincipalId,
  type ResourceId,
  type TenantId,
} from "@langfuse/shared/rbac";

import { authorize, rolesFor } from "@/src/features/rbac/authorize";
import { type Policy } from "@/src/features/rbac/types";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";

const TENANT: TenantId = OrganizationId("org_1");
const OTHER_TENANT: TenantId = OrganizationId("org_2");
const WILDCARD_TENANT: TenantId = OrganizationId("*");
const PRJ: ResourceId = ProjectId("prj_1");
const OTHER_PRJ: ResourceId = ProjectId("prj_2");
const WILDCARD: ResourceId = ProjectId("*");
const ORG: ResourceId = OrganizationId("org_1");
const OTHER_ORG: ResourceId = OrganizationId("org_2");
const WILDCARD_ORG: ResourceId = OrganizationId("*");

const policy = (over: Partial<Policy> = {}): Policy => ({
  id: "system/OWNER:project",
  tenantId: TENANT,
  roleId: SystemRoleId("OWNER"),
  effect: "ALLOW",
  actions: ["prompts:read"],
  resources: [PRJ],
  ...over,
});

const ctxOfSets = (policies: Policy[][]): AuthorizationContext => ({
  principal: {
    kind: "apiKey",
    apiKeyId: "key_1",
    userId: null,
    isInAppAgentKey: false,
    publicKey: "pk-lf-1",
    scope: "PROJECT",
    presentation: "privateKey",
    organizations: [],
    boundResource: { orgId: "org_1", projectId: "prj_1" },
  },
  policies,
});

const ctx = (policies: Policy[]): AuthorizationContext => ctxOfSets([policies]);

describe("authorize — tenant scoping", () => {
  const grant = ctx([policy()]);
  it("authorizes within the resource's tenant", () => {
    expect(authorize(grant, TENANT, "prompts:read", PRJ).success).toBe(true);
  });
  it("denies the same resource under a different tenant", () => {
    expect(authorize(grant, OTHER_TENANT, "prompts:read", PRJ).success).toBe(
      false,
    );
  });
});

describe("authorize — exact project coverage", () => {
  const grant = ctx([policy({ resources: [PRJ] })]);
  it("covers its exact project", () => {
    expect(authorize(grant, TENANT, "prompts:read", PRJ).success).toBe(true);
  });
  it("does not cover another project without a wildcard", () => {
    expect(authorize(grant, TENANT, "prompts:read", OTHER_PRJ).success).toBe(
      false,
    );
  });
});

describe("authorize — project wildcard within a tenant", () => {
  const wildcardGrant = ctx([policy({ resources: [WILDCARD] })]);
  it("grants any project of the tenant", () => {
    expect(authorize(wildcardGrant, TENANT, "prompts:read", PRJ).success).toBe(
      true,
    );
    expect(
      authorize(wildcardGrant, TENANT, "prompts:read", OTHER_PRJ).success,
    ).toBe(true);
  });
  it("does not leak the wildcard to another tenant", () => {
    expect(
      authorize(wildcardGrant, OTHER_TENANT, "prompts:read", PRJ).success,
    ).toBe(false);
  });
});

describe("authorize — exact project overrides the wildcard", () => {
  const c = ctx([
    policy({ id: "wildcard", resources: [WILDCARD], effect: "ALLOW" }),
    policy({ id: "exact-deny", resources: [PRJ], effect: "DENY" }),
  ]);
  it("the exact deny wins on its project, ignoring the allowing wildcard", () => {
    expect(authorize(c, TENANT, "prompts:read", PRJ).success).toBe(false);
  });
  it("the wildcard still allows a project with no exact policy", () => {
    expect(authorize(c, TENANT, "prompts:read", OTHER_PRJ).success).toBe(true);
  });
});

describe("authorize — org resources need an exact match", () => {
  const ORG_RESOURCE: ResourceId = OrganizationId("org_1");
  it("an org policy covers the org resource", () => {
    const orgGrant = ctx([
      policy({
        resources: [ORG_RESOURCE],
        actions: ["projects:create"],
      }),
    ]);
    expect(
      authorize(orgGrant, TENANT, "projects:create", ORG_RESOURCE).success,
    ).toBe(true);
  });
  it("a project wildcard never satisfies an org resource", () => {
    const wildcardGrant = ctx([
      policy({ resources: [WILDCARD], actions: ["projects:create"] }),
    ]);
    expect(
      authorize(wildcardGrant, TENANT, "projects:create", ORG_RESOURCE).success,
    ).toBe(false);
  });
});

describe("authorize — deny-overrides and deny-by-default", () => {
  it("denies by default when nothing matches", () => {
    const decision = authorize(ctx([]), TENANT, "prompts:read", PRJ);
    expect(decision.success).toBe(false);
    expect(decision.error).toMatchObject({
      httpCode: 403,
      message:
        'Access denied. The "prompts:read" permission is required to access this resource.',
    });
  });
  it("a matching deny beats a matching allow on the same resource", () => {
    const suspended = ctx([
      policy({ id: "allow", actions: ["traces:create"], effect: "ALLOW" }),
      policy({ id: "deny", actions: ["traces:create"], effect: "DENY" }),
    ]);
    expect(authorize(suspended, TENANT, "traces:create", PRJ).success).toBe(
      false,
    );
  });
  it("an explicit deny carries the required action", () => {
    const decision = authorize(
      ctx([policy({ actions: ["traces:create"], effect: "DENY" })]),
      TENANT,
      "traces:create",
      PRJ,
    );
    expect(decision.error).toMatchObject({
      httpCode: 403,
      message:
        'Access denied. The "traces:create" permission is required to access this resource.',
    });
  });
});

describe("authorize — kind wildcards are never a target", () => {
  it("denies an authorization check against project/*", () => {
    const wildcardGrant = ctx([policy({ resources: [WILDCARD] })]);
    const decision = authorize(wildcardGrant, TENANT, "prompts:read", WILDCARD);
    expect(decision.success).toBe(false);
    expect(decision.error?.message).toBe(new ForbiddenError().message);
  });
  it("denies an authorization check against organization/*", () => {
    const wildcardGrant = ctx([
      policy({
        tenantId: WILDCARD_TENANT,
        resources: [WILDCARD_ORG],
        actions: ["projects:create"],
      }),
    ]);
    expect(
      authorize(wildcardGrant, TENANT, "projects:create", WILDCARD_ORG).success,
    ).toBe(false);
  });
});

describe("authorize — organization/* tenant spans every tenant", () => {
  const grant = ctx([
    policy({ tenantId: WILDCARD_TENANT, resources: [WILDCARD] }),
  ]);
  it("grants a project of one tenant", () => {
    expect(authorize(grant, TENANT, "prompts:read", PRJ).success).toBe(true);
  });
  it("grants a project of another tenant with the same policy", () => {
    expect(
      authorize(grant, OTHER_TENANT, "prompts:read", OTHER_PRJ).success,
    ).toBe(true);
  });
});

describe("authorize — organization/* resource wildcard covers org targets", () => {
  const grant = ctx([
    policy({
      tenantId: WILDCARD_TENANT,
      resources: [WILDCARD_ORG],
      actions: ["projects:create"],
    }),
  ]);
  it("grants an org target under any tenant", () => {
    expect(authorize(grant, TENANT, "projects:create", ORG).success).toBe(true);
    expect(
      authorize(grant, OTHER_TENANT, "projects:create", OTHER_ORG).success,
    ).toBe(true);
  });
  it("an exact org resource still overrides the org wildcard", () => {
    const c = ctx([
      policy({
        id: "org-wildcard",
        tenantId: WILDCARD_TENANT,
        resources: [WILDCARD_ORG],
        actions: ["projects:create"],
        effect: "ALLOW",
      }),
      policy({
        id: "org-exact-deny",
        tenantId: WILDCARD_TENANT,
        resources: [ORG],
        actions: ["projects:create"],
        effect: "DENY",
      }),
    ]);
    expect(authorize(c, TENANT, "projects:create", ORG).success).toBe(false);
    expect(
      authorize(c, OTHER_TENANT, "projects:create", OTHER_ORG).success,
    ).toBe(true);
  });
});

describe("authorize — every policy set must allow", () => {
  const allowAll = policy({ resources: [WILDCARD] });
  it("denies a context with no policy sets", () => {
    expect(authorize(ctxOfSets([]), TENANT, "prompts:read", PRJ).success).toBe(
      false,
    );
  });
  it("allows when every set allows", () => {
    const c = ctxOfSets([[allowAll], [policy()]]);
    expect(authorize(c, TENANT, "prompts:read", PRJ).success).toBe(true);
  });
  it("denies when one set has no matching grant", () => {
    const c = ctxOfSets([[allowAll], [policy()]]);
    expect(authorize(c, TENANT, "prompts:read", OTHER_PRJ).success).toBe(false);
  });
  it("denies when one set is empty", () => {
    const c = ctxOfSets([[allowAll], []]);
    const decision = authorize(c, TENANT, "prompts:read", PRJ);
    expect(decision.success).toBe(false);
    expect(decision.error).toBeInstanceOf(ForbiddenError);
  });
  it("denies when one set denies explicitly", () => {
    const c = ctxOfSets([
      [allowAll],
      [allowAll, policy({ id: "deny", effect: "DENY" })],
    ]);
    expect(authorize(c, TENANT, "prompts:read", PRJ).success).toBe(false);
  });
  it("does not combine grants across sets", () => {
    const c = ctxOfSets([
      [policy({ resources: [OTHER_PRJ] })],
      [policy({ actions: ["traces:read"] })],
    ]);
    expect(authorize(c, TENANT, "prompts:read", PRJ).success).toBe(false);
  });
});

describe("authorize — group roles add to the principal's own roles", () => {
  const USER = UserId("user_1");
  const GROUP = GroupId("group_1");
  const OTHER_GROUP = GroupId("group_2");

  /** roleOn binds a fixed system role to principal on an org or a project, as loading a role assignment does: an org role also covers every project. */
  const roleOn = (
    principalId: PrincipalId,
    role: keyof typeof systemRoleAccessRights,
    owner: ResourceId,
    tenantId: TenantId = TENANT,
  ): Policy[] => {
    const roleId = SystemRoleId(role);
    const resources = hasProjectKind(owner) ? [owner] : [owner, WILDCARD];
    return systemRoleAccessRights[role].policies.flatMap((definition) => {
      const ofKind = resources.filter(
        definition.resourceKind === "organization"
          ? hasOrganizationKind
          : hasProjectKind,
      );
      if (ofKind.length === 0) return [];
      return [
        {
          id: `${roleId}:${definition.resourceKind}`,
          principalId,
          roleId,
          tenantId,
          effect: definition.effect,
          actions: definition.actions,
          resources: ofKind,
        },
      ];
    });
  };

  it("a direct project role still replaces the direct org role", () => {
    const c = ctx([
      ...roleOn(USER, "MEMBER", ORG),
      ...roleOn(USER, "VIEWER", PRJ),
    ]);
    expect(authorize(c, TENANT, "project:read", PRJ).success).toBe(true);
    expect(authorize(c, TENANT, "datasets:CUD", PRJ).success).toBe(false);
    expect(authorize(c, TENANT, "datasets:CUD", OTHER_PRJ).success).toBe(true);
  });

  it("a direct project NONE removes the direct org role on that project", () => {
    const c = ctx([
      ...roleOn(USER, "MEMBER", ORG),
      ...roleOn(USER, "NONE", PRJ),
    ]);
    expect(authorize(c, TENANT, "project:read", PRJ).success).toBe(false);
    expect(authorize(c, TENANT, "project:read", OTHER_PRJ).success).toBe(true);
  });

  it("a group's org role applies despite a direct project role", () => {
    const c = ctx([
      ...roleOn(USER, "MEMBER", ORG),
      ...roleOn(USER, "VIEWER", PRJ),
      ...roleOn(GROUP, "ADMIN", ORG),
    ]);
    expect(authorize(c, TENANT, "apiKeys:CUD", PRJ).success).toBe(true);
  });

  it("a group's project role does not replace the direct org role", () => {
    const c = ctx([
      ...roleOn(USER, "MEMBER", ORG),
      ...roleOn(GROUP, "VIEWER", PRJ),
    ]);
    expect(authorize(c, TENANT, "datasets:CUD", PRJ).success).toBe(true);
  });

  it("a group's project NONE does not lower the direct org role", () => {
    const c = ctx([
      ...roleOn(USER, "MEMBER", ORG),
      ...roleOn(GROUP, "NONE", PRJ),
    ]);
    expect(authorize(c, TENANT, "datasets:CUD", PRJ).success).toBe(true);
  });

  it("a group's project role does not replace the same group's org role", () => {
    const c = ctx([
      ...roleOn(USER, "NONE", ORG),
      ...roleOn(GROUP, "ADMIN", ORG),
      ...roleOn(GROUP, "VIEWER", PRJ),
    ]);
    expect(authorize(c, TENANT, "apiKeys:CUD", PRJ).success).toBe(true);
  });

  it("two groups' roles on one project add up and cover no other project", () => {
    const c = ctx([
      ...roleOn(USER, "NONE", ORG),
      ...roleOn(GROUP, "VIEWER", PRJ),
      ...roleOn(OTHER_GROUP, "ADMIN", PRJ),
    ]);
    expect(authorize(c, TENANT, "project:read", PRJ).success).toBe(true);
    expect(authorize(c, TENANT, "apiKeys:CUD", PRJ).success).toBe(true);
    expect(authorize(c, TENANT, "project:read", OTHER_PRJ).success).toBe(false);
  });

  it("a group's org role grants an org action the direct org role lacks", () => {
    const direct = roleOn(USER, "VIEWER", ORG);
    expect(
      authorize(ctx(direct), TENANT, "organizationMembers:CUD", ORG).success,
    ).toBe(false);

    const c = ctx([...direct, ...roleOn(GROUP, "ADMIN", ORG)]);
    expect(authorize(c, TENANT, "organizationMembers:CUD", ORG).success).toBe(
      true,
    );
  });

  it("a group's role in another tenant grants nothing", () => {
    const c = ctx([
      ...roleOn(USER, "NONE", ORG),
      ...roleOn(GROUP, "ADMIN", OTHER_ORG, OTHER_TENANT),
    ]);
    expect(authorize(c, TENANT, "project:read", PRJ).success).toBe(false);
    expect(authorize(c, TENANT, "organizationMembers:read", ORG).success).toBe(
      false,
    );
  });

  it("a group's role widens the user's set of a user-bound key, not the key's own set", () => {
    const keySet = roleOn(ApiKeyId("key_1"), "AI_GATEWAY", ORG);
    const withoutGroup = ctxOfSets([roleOn(USER, "NONE", ORG), keySet]);
    expect(authorize(withoutGroup, TENANT, "gateway:invoke", ORG).success).toBe(
      false,
    );

    const withGroup = ctxOfSets([
      [...roleOn(USER, "NONE", ORG), ...roleOn(GROUP, "ADMIN", ORG)],
      keySet,
    ]);
    expect(authorize(withGroup, TENANT, "gateway:invoke", ORG).success).toBe(
      true,
    );
    expect(
      authorize(withGroup, TENANT, "organizationMembers:CUD", ORG).success,
    ).toBe(false);
  });

  it("rolesFor lists the direct project role and the group's role, not the replaced direct org role", () => {
    const c = ctx([
      ...roleOn(USER, "MEMBER", ORG),
      ...roleOn(USER, "VIEWER", PRJ),
      ...roleOn(GROUP, "ADMIN", ORG),
    ]);
    expect(rolesFor(c, TENANT, PRJ)).toEqual([
      SystemRoleId("VIEWER"),
      SystemRoleId("ADMIN"),
    ]);
  });
});
