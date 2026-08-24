/// <reference types="vitest/importMeta" />
/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/policy-core-types`,
 * LFE-15037). Proves the RFC policy-core types compile against Langfuse's real
 * scope vocabularies and that `authorize` behaves. Findings live in the ticket.
 * Run: `pnpm --filter web run test:in-source policy.prototype`.
 */

import { z } from "zod";

import {
  projectScopes,
  projectRoleAccessRights,
  BaseError,
  ForbiddenError,
  CloudConfigRateLimit,
  type ProjectScope,
  type Plan,
} from "@langfuse/shared";
import {
  organizationScopes,
  organizationRoleAccessRights,
  type OrganizationScope,
} from "@/src/features/rbac/constants/organizationAccessRights";

/** wildcard matches any resource in a policy. */
export const wildcard = "*" as const;

/** Wildcard is the type of the wildcard resource matcher literal. */
type Wildcard = typeof wildcard;

/** SystemRule is a system-originated deny rule the PIP attaches for an org entitlement suspension. */
export type SystemRule = "ingestion_suspended" | "mcp_suspended";

/** systemRuleMessages maps each system deny rule to the 403 message its endpoint throws. */
export const systemRuleMessages: Record<SystemRule, string> = {
  ingestion_suspended:
    "Ingestion suspended: Usage threshold exceeded. Please upgrade your plan.",
  mcp_suspended:
    "Access suspended: Usage threshold exceeded. Please upgrade your plan.",
};

/** pendingProjectApiActions holds net-new project-level public-API tokens absent from projectScopes. */
export const pendingProjectApiActions = [
  "traces:read",
  "traces:create",
  "scores:read",
  "scores:create",
  "media:create",
  "sessions:read",
  "metrics:read",
  "models:read",
  "experiments:read",
  "mcp:access",
] as const;

/** PendingProjectApiAction is a net-new project-level public-API token. */
export type PendingProjectApiAction = (typeof pendingProjectApiActions)[number];

/** ProjectAction is an action assignable to a project policy. */
export type ProjectAction = ProjectScope | PendingProjectApiAction;

/** pendingOrganizationApiActions holds net-new org-level public-API tokens absent from organizationScopes. */
export const pendingOrganizationApiActions = ["projects:read"] as const;

/** PendingOrganizationApiAction is a net-new org-level public-API token. */
export type PendingOrganizationApiAction =
  (typeof pendingOrganizationApiActions)[number];

/** OrganizationAction is an action assignable to an organization policy. */
export type OrganizationAction = OrganizationScope | PendingOrganizationApiAction;

/** Action is any checkable action. */
export type Action = ProjectAction | OrganizationAction;

/** allProjectActions is the full project vocabulary — every project action, spelled out for grants that cover everything at project level. */
export const allProjectActions: ProjectAction[] = [
  ...projectScopes,
  ...pendingProjectApiActions,
];

/** allOrganizationActions is the full org vocabulary — every org action. */
export const allOrganizationActions: OrganizationAction[] = [
  ...organizationScopes,
  ...pendingOrganizationApiActions,
];

/** PrincipalOrganization carries the org's static caps the entitlement and rate-limit seams read: the resolved plan and its rate-limit config, not the billing blob. */
export type PrincipalOrganization = {
  orgId: string;
  plan: Plan;
  rateLimitConfig: z.infer<typeof CloudConfigRateLimit>;
  projectIds: string[];
};

/** Principal is an authorized admin, user, or api key, discriminated on kind. */
export type Principal =
  | { kind: "admin"; userId: string | null }
  | { kind: "user"; userId: string; organizations: PrincipalOrganization[] }
  | {
      kind: "apiKey";
      apiKeyId: string;
      userId: string | null;
      organizations: PrincipalOrganization[];
      boundResource?: Resource; // legacy single-target; absent on granular keys, which require the request header
    };

/** Source describes where a policy came from: a role, an explicit grant, or a system suspension rule. */
export type Source =
  | { kind: "role"; id: string }
  | { kind: "grant" }
  | { kind: "system"; rule: SystemRule };

/** ProjectResource identifies a project by id alone; Project.id is globally unique so no org qualifier is needed. */
export type ProjectResource = { projectId: string };

/** OrgResource identifies an org node. */
export type OrgResource = { orgId: string };

/** Resource is the thing being checked and the atom a policy targets: a bare project or an org node. */
export type Resource = ProjectResource | OrgResource;

/** ResourceRef is any resource matcher evaluation can meet: the wildcard or a single atomic resource. */
export type ResourceRef = Wildcard | Resource;

/** BasePolicy carries the fields every policy shares: its origin and whether it allows or denies. */
export type BasePolicy = {
  source: Source;
  effect: "allow" | "deny";
};

/** OrganizationSystemPolicy is a resource-less org-level policy: actions without the org node they bind to. */
export type OrganizationSystemPolicy = BasePolicy & {
  kind: "organization";
  actions: OrganizationAction[];
};

/** ProjectSystemPolicy is a resource-less project-level policy: actions without the project they bind to. */
export type ProjectSystemPolicy = BasePolicy & {
  kind: "project";
  actions: ProjectAction[];
};

/** SystemPolicy is a policy before its resource is bound — the shape scope grants and system denies take as templates. */
export type SystemPolicy = OrganizationSystemPolicy | ProjectSystemPolicy;

/** OrganizationPolicy is an OrganizationSystemPolicy bound to org nodes. */
export type OrganizationPolicy = OrganizationSystemPolicy & {
  resources: (Wildcard | OrgResource)[];
};

/** ProjectPolicy is a ProjectSystemPolicy bound to atomic project refs. */
export type ProjectPolicy = ProjectSystemPolicy & {
  resources: (Wildcard | ProjectResource)[];
};

/** Policy is a SystemPolicy bound to resources; kind-discriminated so a wildcard and evaluation stay within one kind. */
export type Policy = OrganizationPolicy | ProjectPolicy;

/** AuthorizationContext is the PIP output and PDP input for one principal. */
export type AuthorizationContext = {
  principal: Principal;
  policies: Policy[];
};

/** Success is a successful outcome, disjoint from ErrorResult on `success`. */
export type Success = { success: true; error?: never };

/** ErrorResult is a failed outcome carrying the typed error. */
export type ErrorResult<E extends BaseError> = { success: false; error: E };

/** Decision is a PDP outcome: a boolean success, or a typed 403; the residual resource filter returns additively in Phase 3–4. */
export type Decision = Success | ErrorResult<ForbiddenError>;

/** authorize decides whether the context permits action on resource: a boolean success or a typed 403. */
export function authorize(
  ctx: AuthorizationContext,
  action: Action,
  resource: Resource,
): Decision {
  return decide(ctx, action, resource);
}

/** decide evaluates the policies for action on resource: a matching deny 403s (system rules keep their message), else a matching allow succeeds, else implicit-deny 403. */
function decide(
  ctx: AuthorizationContext,
  action: Action,
  resource: Resource,
): Decision {
  const matchesRef = matchesResource(resource);
  const matches = ctx.policies
    .filter(hasAction(action))
    .filter((p) => p.resources.some(matchesRef));

  const denies = matches.filter(hasEffect("deny"));
  if (denies.length > 0) {
    return forbidden(denies.find(hasSource("system")) ?? denies[0]);
  }
  if (matches.some(hasEffect("allow"))) {
    return { success: true };
  }
  return forbidden();
}

/** matchesResource reports whether ref covers the checked resource: the wildcard, or the same atomic kind and id. */
const matchesResource =
  (resource: Resource) =>
  (ref: ResourceRef): boolean => {
    if (ref === wildcard) return true;
    if ("projectId" in resource) {
      return "projectId" in ref && ref.projectId === resource.projectId;
    }
    return "orgId" in ref && ref.orgId === resource.orgId;
  };

/** hasAction matches a policy granting the action explicitly; actions are always spelled out, never wildcarded. */
const hasAction = (action: Action) => (p: Policy) =>
  p.actions.some((a) => a === action);

/** hasEffect matches a policy of the given effect. */
const hasEffect = (effect: Policy["effect"]) => (p: Policy) =>
  p.effect === effect;

/** hasSource matches a policy from the given source kind. */
const hasSource = (kind: Source["kind"]) => (p: Policy) =>
  p.source.kind === kind;

/** forbidden builds a 403 Decision, using the deny policy's message when given one. */
function forbidden(policy?: Policy): ErrorResult<ForbiddenError> {
  return {
    success: false,
    error: new ForbiddenError(forbiddenErrorMessage(policy)),
  };
}

/** forbiddenErrorMessage returns the 403 message a deny policy carries; system rules override the vanilla default. */
function forbiddenErrorMessage(policy?: Policy): string {
  if (policy?.source.kind === "system") {
    return systemRuleMessages[policy.source.rule];
  }
  return "Forbidden";
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  const ORG = "org_1";
  const PRJ = "prj_1";
  const OTHER_PRJ = "prj_2";

  const allowProject = (
    actions: ProjectAction[],
    resources: (Wildcard | ProjectResource)[],
  ): ProjectPolicy => ({
    kind: "project",
    source: { kind: "role", id: "OWNER" },
    actions,
    resources,
    effect: "allow",
  });
  const allowOrg = (
    actions: OrganizationAction[],
    resources: (Wildcard | OrgResource)[],
  ): OrganizationPolicy => ({
    kind: "organization",
    source: { kind: "role", id: "OWNER" },
    actions,
    resources,
    effect: "allow",
  });
  const denyProject = (
    actions: ProjectAction[],
    resources: (Wildcard | ProjectResource)[],
    rule: SystemRule = "ingestion_suspended",
  ): ProjectPolicy => ({
    kind: "project",
    source: { kind: "system", rule },
    actions,
    resources,
    effect: "deny",
  });
  const ctx = (
    policies: Policy[],
    principal?: Principal,
  ): AuthorizationContext => ({
    principal: principal ?? {
      kind: "apiKey",
      apiKeyId: "key_1",
      userId: null,
      organizations: [
        {
          orgId: ORG,
          plan: "cloud:hobby",
          rateLimitConfig: [],
          projectIds: [PRJ],
        },
      ],
    },
    policies,
  });

  describe("authorize — project coverage", () => {
    const grant = ctx([allowProject(["prompts:read"], [{ projectId: PRJ }])]);
    it.each([
      ["a grant covers its project", { projectId: PRJ }, true],
      ["a grant does not cover another project", { projectId: OTHER_PRJ }, false],
    ] as const)("%s", (_name, resource, expected) => {
      expect(authorize(grant, "prompts:read", resource).success).toBe(expected);
    });
    it("an org-wide grant is its materialized project refs, nothing implicit", () => {
      const orgWide = ctx([
        allowProject(
          ["prompts:read"],
          [{ projectId: PRJ }, { projectId: OTHER_PRJ }],
        ),
      ]);
      expect(
        authorize(orgWide, "prompts:read", { projectId: OTHER_PRJ }).success,
      ).toBe(true);
      expect(
        authorize(orgWide, "prompts:read", { projectId: "prj_x" }).success,
      ).toBe(false);
    });
    it("no project ref grants nothing", () => {
      const empty = ctx([allowProject(["auditLogs:read"], [])]);
      expect(
        authorize(empty, "auditLogs:read", { projectId: PRJ }).success,
      ).toBe(false);
      expect(authorize(empty, "auditLogs:read", { orgId: ORG }).success).toBe(
        false,
      );
    });
  });

  describe("authorize — org-level actions", () => {
    const orgAdmin = ctx([allowOrg(["projects:create"], [{ orgId: ORG }])]);
    it("an org ref covers org-level actions", () => {
      expect(
        authorize(orgAdmin, "projects:create", { orgId: ORG }).success,
      ).toBe(true);
    });
    it("org grant does not leak to another org", () => {
      expect(
        authorize(orgAdmin, "projects:create", { orgId: "org_x" }).success,
      ).toBe(false);
    });
    it("projects:read is an org action backing the org token's whole-org read", () => {
      const orgReader = ctx([allowOrg(["projects:read"], [{ orgId: ORG }])]);
      expect(
        authorize(orgReader, "projects:read", { orgId: ORG }).success,
      ).toBe(true);
    });
  });

  describe("authorize — admin wildcard has no PDP branch", () => {
    const admin = ctx(
      [
        allowOrg(allOrganizationActions, [wildcard]),
        allowProject(allProjectActions, [wildcard]),
      ],
      {
        kind: "admin",
        userId: null,
      },
    );
    it("admin allows any project action", () => {
      expect(authorize(admin, "prompts:read", { projectId: "y" }).success).toBe(
        true,
      );
    });
    it("admin allows any org action", () => {
      expect(authorize(admin, "projects:create", { orgId: "x" }).success).toBe(
        true,
      );
    });
  });

  describe("authorize — deny-overrides and deny-by-default", () => {
    it("denies by default when nothing matches", () => {
      expect(
        authorize(ctx([]), "prompts:read", { projectId: PRJ }).success,
      ).toBe(false);
    });
    it("a per-project materialized deny blocks each project it names", () => {
      const c = ctx([
        allowProject(
          ["auditLogs:read"],
          [{ projectId: PRJ }, { projectId: OTHER_PRJ }],
        ),
        denyProject(
          ["auditLogs:read"],
          [{ projectId: PRJ }, { projectId: OTHER_PRJ }],
        ),
      ]);
      expect(authorize(c, "auditLogs:read", { projectId: PRJ }).success).toBe(
        false,
      );
      expect(
        authorize(c, "auditLogs:read", { projectId: OTHER_PRJ }).success,
      ).toBe(false);
    });
    it("a matching deny beats a matching allow", () => {
      const suspended = ctx([
        allowProject(["traces:create"], [{ projectId: PRJ }]),
        denyProject(["traces:create"], [{ projectId: PRJ }]),
      ]);
      expect(
        authorize(suspended, "traces:create", { projectId: PRJ }).success,
      ).toBe(false);
    });
    it("a deny of the checked project beats an allow that also covers other projects", () => {
      const c = ctx([
        allowProject(
          ["prompts:read"],
          [{ projectId: PRJ }, { projectId: OTHER_PRJ }],
        ),
        denyProject(["prompts:read"], [{ projectId: PRJ }]),
      ]);
      expect(authorize(c, "prompts:read", { projectId: PRJ }).success).toBe(
        false,
      );
      expect(
        authorize(c, "prompts:read", { projectId: OTHER_PRJ }).success,
      ).toBe(true);
    });
    it("an ingestion_suspended deny carries the endpoint's 403 message", () => {
      const suspended = ctx([
        denyProject(["traces:create"], [{ projectId: PRJ }]),
      ]);
      const decision = authorize(suspended, "traces:create", {
        projectId: PRJ,
      });
      expect(decision.error?.message).toBe(
        systemRuleMessages.ingestion_suspended,
      );
    });
    it("a non-system deny carries the generic message", () => {
      const roleDeny: Policy = {
        kind: "project",
        source: { kind: "role", id: "OWNER" },
        actions: ["traces:create"],
        resources: [{ projectId: PRJ }],
        effect: "deny",
      };
      const decision = authorize(ctx([roleDeny]), "traces:create", {
        projectId: PRJ,
      });
      expect(decision.error?.message).toBe(new ForbiddenError().message);
    });
  });

  describe("ingestion suspension boundary", () => {
    const suspended = ctx([
      allowProject(allProjectActions, [{ projectId: PRJ }]),
      denyProject(
        ["traces:create", "scores:create", "media:create"],
        [{ projectId: PRJ }],
      ),
      denyProject(["mcp:access"], [{ projectId: PRJ }], "mcp_suspended"),
    ]);
    it.each([
      ["traces:create", systemRuleMessages.ingestion_suspended],
      ["scores:create", systemRuleMessages.ingestion_suspended],
      ["media:create", systemRuleMessages.ingestion_suspended],
      ["mcp:access", systemRuleMessages.mcp_suspended],
    ] as const)("suspends %s with its rule's message", (action, message) => {
      const decision = authorize(suspended, action, { projectId: PRJ });
      expect(decision.success).toBe(false);
      expect(decision.error?.message).toBe(message);
    });
    it("leaves reads available under suspension", () => {
      expect(
        authorize(suspended, "traces:read", { projectId: PRJ }).success,
      ).toBe(true);
    });
  });

  describe("scope-union overlap", () => {
    it("auditLogs:read is the sole token in both real vocabularies", () => {
      const overlap = (projectScopes as readonly string[]).filter((s) =>
        (organizationScopes as readonly string[]).includes(s),
      );
      expect(overlap).toEqual(["auditLogs:read"]);
    });
    it("a project audit grant no longer satisfies its org's org-level check", () => {
      const projectAudit = ctx([
        allowProject(["auditLogs:read"], [{ projectId: PRJ }]),
      ]);
      expect(
        authorize(projectAudit, "auditLogs:read", { projectId: PRJ }).success,
      ).toBe(true);
      expect(
        authorize(projectAudit, "auditLogs:read", { orgId: ORG }).success,
      ).toBe(false);
    });
  });

  describe("real role expansions type-check against the kind vocabularies", () => {
    it("every role's project and org scopes assign to their action unions", () => {
      const roles = Object.keys(
        projectRoleAccessRights,
      ) as (keyof typeof projectRoleAccessRights)[];
      for (const r of roles) {
        const p: ProjectAction[] = projectRoleAccessRights[r];
        const o: OrganizationAction[] = organizationRoleAccessRights[r];
        expect(Array.isArray(p)).toBe(true);
        expect(Array.isArray(o)).toBe(true);
      }
    });
  });

  describe("type-level invariants", () => {
    it("policy kind compile-enforces action/resource pairing", () => {
      const org: OrganizationPolicy = {
        kind: "organization",
        source: { kind: "role", id: "OWNER" },
        // @ts-expect-error prompts:read is a project action
        actions: ["prompts:read"],
        resources: [{ orgId: ORG }],
        effect: "allow",
      };
      const project: ProjectPolicy = {
        kind: "project",
        source: { kind: "role", id: "OWNER" },
        // @ts-expect-error projects:create is an org action
        actions: ["projects:create"],
        resources: [{ projectId: PRJ }],
        effect: "allow",
      };
      const orgResources: OrganizationPolicy = {
        kind: "organization",
        source: { kind: "role", id: "OWNER" },
        actions: ["projects:create"],
        // @ts-expect-error an org policy cannot carry a project ref
        resources: [{ projectId: PRJ }],
        effect: "allow",
      };
      const projectResources: ProjectPolicy = {
        kind: "project",
        source: { kind: "role", id: "OWNER" },
        actions: ["prompts:read"],
        // @ts-expect-error a project policy cannot carry an org ref
        resources: [{ orgId: ORG }],
        effect: "allow",
      };
      void org;
      void project;
      void orgResources;
      void projectResources;
      expect(true).toBe(true);
    });
    it("Principal narrows on kind before organizations", () => {
      const p = { kind: "admin", userId: null } as Principal;
      // @ts-expect-error admin has no organizations without narrowing
      void p.organizations;
      if (p.kind === "apiKey") void p.organizations;
      expect(true).toBe(true);
    });
    it("a legacy apiKey carries boundResource; a granular one omits it", () => {
      const legacy = {
        kind: "apiKey",
        apiKeyId: "key_1",
        userId: null,
        organizations: [],
        boundResource: { projectId: PRJ },
      } satisfies Principal;
      const granular = {
        kind: "apiKey",
        apiKeyId: "key_2",
        userId: null,
        organizations: [],
      } satisfies Principal;
      expect(legacy.boundResource).toEqual({ projectId: PRJ });
      expect("boundResource" in granular).toBe(false);
    });
    it("Success and ErrorResult discriminate under strict", () => {
      const d = { success: true } as Decision;
      const typecheckOnly = () => {
        if (d.success) {
          // @ts-expect-error no error on the success branch
          return d.error.message;
        }
        return d.error.message;
      };
      void typecheckOnly;
      expect(d.success).toBe(true);
    });
  });
}
