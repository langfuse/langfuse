import { describe, expect, it } from "vitest";

import { ForbiddenError } from "@langfuse/shared";
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  type ResourceId,
  type TenantId,
} from "@langfuse/shared/rbac";

import { authorize } from "@/src/features/rbac/authorize";
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

const ctx = (policies: Policy[]): AuthorizationContext => ({
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
    expect(authorize(ctx([]), TENANT, "prompts:read", PRJ).success).toBe(false);
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
  it("a deny carries the generic Forbidden message", () => {
    const decision = authorize(
      ctx([policy({ actions: ["traces:create"], effect: "DENY" })]),
      TENANT,
      "traces:create",
      PRJ,
    );
    expect(decision.error?.message).toBe(new ForbiddenError().message);
  });
});

describe("authorize — kind wildcards are never a target", () => {
  it("denies an authorization check against project/*", () => {
    const wildcardGrant = ctx([policy({ resources: [WILDCARD] })]);
    expect(
      authorize(wildcardGrant, TENANT, "prompts:read", WILDCARD).success,
    ).toBe(false);
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
