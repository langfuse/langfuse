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

/** wildcard matches any org, project, or action in a policy. */
const wildcard = "*" as const;

/** Wildcard is the type of the wildcard matcher literal. */
type Wildcard = typeof wildcard;

/** SystemRule is a system-originated deny rule the PIP can attach. */
type SystemRule = "ingestion_suspended" | "mcp_disabled";

/** systemRuleMessages maps each system deny rule to the 403 message its endpoint throws. */
export const systemRuleMessages: Record<SystemRule, string> = {
  ingestion_suspended:
    "Ingestion suspended: Usage threshold exceeded. Please upgrade your plan.",
  mcp_disabled:
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
  "projects:read",
  "mcp:access",
] as const;

/** PendingProjectApiAction is a net-new project-level public-API token. */
export type PendingProjectApiAction = (typeof pendingProjectApiActions)[number];

/** ProjectAction is an action assignable to a project policy. */
export type ProjectAction = ProjectScope | PendingProjectApiAction | Wildcard;

/** OrganizationAction is an action assignable to an organization policy. */
export type OrganizationAction = OrganizationScope | Wildcard;

/** Action is any checkable action. */
export type Action = ProjectAction | OrganizationAction;

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

/** Source describes where a policy came from. */
export type Source =
  | { kind: "role"; id: string }
  | { kind: "grant" }
  | { kind: "system"; rule: SystemRule };

/** OrgRef targets an org node; only organization policies carry it. */
export type OrgRef = { orgId: string };

/** OrgProjectsRef targets projects in an org; the PIP always materializes the full list — an org-wide grant spells out every project id. */
export type OrgProjectsRef = { orgId: string; projectIds: string[] };

/** ScopedRef is a non-wildcard resource ref of either kind. */
export type ScopedRef = OrgRef | OrgProjectsRef;

/** ResourceRef is any resource matcher evaluation can meet. */
export type ResourceRef = Wildcard | ScopedRef;

/** ProjectResource identifies a checked project by id alone. */
export type ProjectResource = { projectId: string };

/** OrgResource identifies a checked org node. */
export type OrgResource = { orgId: string };

/** Resource is the thing being checked: a bare project or an org node. */
export type Resource = ProjectResource | OrgResource;

/** PolicyBase carries the fields every policy kind shares. */
type PolicyBase = {
  source: Source;
  effect: "allow" | "deny";
};

/** OrganizationPolicy grants or denies org-level actions on org nodes. */
export type OrganizationPolicy = PolicyBase & {
  kind: "organization";
  actions: OrganizationAction[];
  resources: (Wildcard | OrgRef)[];
};

/** ProjectPolicy grants or denies project-level actions on materialized project lists. */
export type ProjectPolicy = PolicyBase & {
  kind: "project";
  actions: ProjectAction[];
  resources: (Wildcard | OrgProjectsRef)[];
};

/** Policy is kind-discriminated to compile-enforce action/resource pairing; evaluation reads only actions and resources. */
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

/** Access is the residual resource filter a successful decision carries: consumers include the covered refs and exclude the denied ones (IN … AND NOT IN …). */
export type Access = {
  includes: ResourceRef[];
  excludes: ScopedRef[]; // never the wildcard — a wildcard deny is a 403
};

/** AccessResult is a successful outcome carrying the residual Access filter. */
export type AccessResult = Success & { access: Access };

/** Decision is a PDP outcome: an AccessResult, or a typed 403. */
export type Decision = AccessResult | ErrorResult<ForbiddenError>;

/** authorize decides whether the context permits action on resource, overload-typed: org actions check org nodes; project actions check a project, or an org for list filtering. */
export function authorize(
  ctx: AuthorizationContext,
  action: OrganizationAction,
  resource: OrgResource,
): Decision;
export function authorize(
  ctx: AuthorizationContext,
  action: ProjectAction,
  resource: Resource,
): Decision;
export function authorize(
  ctx: AuthorizationContext,
  action: Action,
  resource: Resource,
): Decision {
  return decide(ctx, action, resource);
}

/** mustAuthorize is authorize but throws the 403 on denial, returning the Access filter on success. */
export function mustAuthorize(
  ctx: AuthorizationContext,
  action: OrganizationAction,
  resource: OrgResource,
): Access;
export function mustAuthorize(
  ctx: AuthorizationContext,
  action: ProjectAction,
  resource: Resource,
): Access;
export function mustAuthorize(
  ctx: AuthorizationContext,
  action: Action,
  resource: Resource,
): Access {
  const decision = decide(ctx, action, resource);
  if (!decision.success) throw decision.error;
  return decision.access;
}

/** decide evaluates the policies for action on resource: a wildcard deny 403s outright (it cannot be materialized into excludes), every scoped deny subtracts inside survives. */
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
  const denyAll = denies.find((p) => p.resources.includes(wildcard));
  if (denyAll) return forbidden(denyAll);

  const includes = matches
    .filter(hasEffect("allow"))
    .flatMap(getResources)
    .filter(matchesRef);
  const excludes = denies
    .flatMap(getResources)
    .filter(matchesRef)
    .filter(notWild);

  if (!survives(resource, includes, excludes))
    return forbidden(denies.find(hasSource("system")));
  return access(includes.includes(wildcard) ? [wildcard] : includes, excludes);
}

/** getResources returns a policy's resource refs. */
const getResources = (p: Policy): ResourceRef[] => p.resources;

/** matchesResource reports whether ref covers any part of the checked resource: the wildcard, a list containing a checked project, or any same-org ref on an org check. */
const matchesResource =
  (resource: Resource) =>
  (ref: ResourceRef): boolean => {
    if (ref === wildcard) return true;
    if ("projectId" in resource) {
      return "projectIds" in ref && ref.projectIds.includes(resource.projectId);
    }
    return ref.orgId === resource.orgId;
  };

/** survives reports whether any granted ref still covers part of the check after the denies: grants slice to the checked resource, an org-node deny kills its whole org, project denies subtract ids. */
const survives = (
  resource: Resource,
  includes: ResourceRef[],
  excludes: ScopedRef[],
): boolean =>
  includes.some((ref) => {
    if (ref === wildcard) return true;
    if (excludes.some((d) => !("projectIds" in d) && d.orgId === ref.orgId))
      return false;
    if (!("projectIds" in ref)) return true;
    const granted =
      "projectId" in resource
        ? ref.projectIds.filter((id) => id === resource.projectId)
        : ref.projectIds;
    const denied = new Set(
      excludes.flatMap((d) =>
        "projectIds" in d && d.orgId === ref.orgId ? d.projectIds : [],
      ),
    );
    return granted.some((id) => !denied.has(id));
  });

/** hasAction matches a policy granting the action explicitly, or by wildcard within the policy kind's own vocabulary. */
const hasAction = (action: Action) => (p: Policy) =>
  p.actions.some((a) => a === action) ||
  (p.actions.some((a) => a === wildcard) && kindVocabularyHas(p.kind, action));

/** kindVocabularyHas reports whether action belongs to the policy kind's vocabulary, so a wildcard never grants across kinds. */
const kindVocabularyHas = (kind: Policy["kind"], action: Action): boolean =>
  action === wildcard ||
  (kind === "organization"
    ? (organizationScopes as readonly string[]).includes(action)
    : (projectScopes as readonly string[]).includes(action) ||
      (pendingProjectApiActions as readonly string[]).includes(action));

/** hasEffect matches a policy of the given effect. */
const hasEffect = (effect: Policy["effect"]) => (p: Policy) =>
  p.effect === effect;

/** hasSource matches a policy from the given source kind. */
const hasSource = (kind: Source["kind"]) => (p: Policy) =>
  p.source.kind === kind;

/** notWild narrows out the wildcard. */
const notWild = <T>(value: T | Wildcard): value is T => value !== wildcard;

/** access builds a successful Decision carrying the residual filter. */
function access(
  includes: ResourceRef[],
  excludes: ScopedRef[] = [],
): AccessResult {
  return { success: true, access: { includes, excludes } };
}

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
    resources: (Wildcard | OrgProjectsRef)[],
  ): ProjectPolicy => ({
    kind: "project",
    source: { kind: "role", id: "OWNER" },
    actions,
    resources,
    effect: "allow",
  });
  const allowOrg = (
    actions: OrganizationAction[],
    resources: (Wildcard | OrgRef)[],
  ): OrganizationPolicy => ({
    kind: "organization",
    source: { kind: "role", id: "OWNER" },
    actions,
    resources,
    effect: "allow",
  });
  const denyProject = (
    actions: ProjectAction[],
    resources: (Wildcard | OrgProjectsRef)[],
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
    const grant = ctx([
      allowProject(["prompts:read"], [{ orgId: ORG, projectIds: [PRJ] }]),
    ]);
    it.each([
      ["a ref covers a project in its list", { projectId: PRJ }, true],
      [
        "a ref denies a project outside its list",
        { projectId: OTHER_PRJ },
        false,
      ],
    ] as const)("%s", (_name, resource, expected) => {
      expect(authorize(grant, "prompts:read", resource).success).toBe(expected);
    });
    it("an org-wide grant is its materialized project list, nothing implicit", () => {
      const orgWide = ctx([
        allowProject(
          ["prompts:read"],
          [{ orgId: ORG, projectIds: [PRJ, OTHER_PRJ] }],
        ),
      ]);
      expect(
        authorize(orgWide, "prompts:read", { projectId: OTHER_PRJ }).success,
      ).toBe(true);
      expect(
        authorize(orgWide, "prompts:read", { projectId: "prj_x" }).success,
      ).toBe(false);
    });
    it("an empty project list grants nothing", () => {
      const empty = ctx([
        allowProject(["auditLogs:read"], [{ orgId: ORG, projectIds: [] }]),
      ]);
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
    it("an org check carries every covering allow ref", () => {
      const c = ctx([
        allowProject(["auditLogs:read"], [{ orgId: ORG, projectIds: [PRJ] }]),
        allowProject(
          ["auditLogs:read"],
          [{ orgId: ORG, projectIds: [PRJ, OTHER_PRJ] }],
        ),
      ]);
      const decision = authorize(c, "auditLogs:read", { orgId: ORG });
      expect(decision.success && decision.access.includes).toEqual([
        { orgId: ORG, projectIds: [PRJ] },
        { orgId: ORG, projectIds: [PRJ, OTHER_PRJ] },
      ]);
    });
  });

  describe("authorize — admin wildcard has no PDP branch", () => {
    const admin = ctx(
      [allowOrg([wildcard], [wildcard]), allowProject([wildcard], [wildcard])],
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
    it("an org check carries the deny refs as excludes", () => {
      const c = ctx([
        allowProject(
          ["auditLogs:read"],
          [{ orgId: ORG, projectIds: [PRJ, OTHER_PRJ] }],
        ),
        denyProject(
          ["auditLogs:read"],
          [{ orgId: ORG, projectIds: [OTHER_PRJ] }],
        ),
      ]);
      const decision = authorize(c, "auditLogs:read", { orgId: ORG });
      expect(decision.success && decision.access).toEqual({
        includes: [{ orgId: ORG, projectIds: [PRJ, OTHER_PRJ] }],
        excludes: [{ orgId: ORG, projectIds: [OTHER_PRJ] }],
      });
    });
    it("an org check whose grants are fully denied is a 403", () => {
      const c = ctx([
        allowProject(["auditLogs:read"], [{ orgId: ORG, projectIds: [PRJ] }]),
        denyProject(["auditLogs:read"], [{ orgId: ORG, projectIds: [PRJ] }]),
      ]);
      expect(authorize(c, "auditLogs:read", { orgId: ORG }).success).toBe(
        false,
      );
    });
    it("an org-wide materialized deny blocks every check in the org", () => {
      const c = ctx([
        allowProject(["auditLogs:read"], [{ orgId: ORG, projectIds: [PRJ] }]),
        denyProject(
          ["auditLogs:read"],
          [{ orgId: ORG, projectIds: [PRJ, OTHER_PRJ] }],
        ),
      ]);
      expect(authorize(c, "auditLogs:read", { projectId: PRJ }).success).toBe(
        false,
      );
      expect(authorize(c, "auditLogs:read", { orgId: ORG }).success).toBe(
        false,
      );
    });
    it("a matching deny beats a matching allow", () => {
      const suspended = ctx([
        allowProject(["traces:create"], [{ orgId: ORG, projectIds: [PRJ] }]),
        denyProject(["traces:create"], [{ orgId: ORG, projectIds: [PRJ] }]),
      ]);
      expect(
        authorize(suspended, "traces:create", { projectId: PRJ }).success,
      ).toBe(false);
    });
    it("a deny of the checked project beats an allow that also covers other projects", () => {
      const c = ctx([
        allowProject(
          ["prompts:read"],
          [{ orgId: ORG, projectIds: [PRJ, OTHER_PRJ] }],
        ),
        denyProject(["prompts:read"], [{ orgId: ORG, projectIds: [PRJ] }]),
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
        denyProject(["traces:create"], [{ orgId: ORG, projectIds: [PRJ] }]),
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
        resources: [{ orgId: ORG, projectIds: [PRJ] }],
        effect: "deny",
      };
      const decision = authorize(ctx([roleDeny]), "traces:create", {
        projectId: PRJ,
      });
      expect(decision.error?.message).toBe(new ForbiddenError().message);
    });
    it("mustAuthorize throws on denial, returns the covering grants", () => {
      const c = ctx([
        allowProject(
          ["prompts:read"],
          [{ orgId: ORG, projectIds: [PRJ, OTHER_PRJ] }],
        ),
      ]);
      expect(
        mustAuthorize(c, "prompts:read", { projectId: PRJ }).includes,
      ).toEqual([{ orgId: ORG, projectIds: [PRJ, OTHER_PRJ] }]);
      expect(() =>
        mustAuthorize(c, "traces:delete", { projectId: PRJ }),
      ).toThrow();
    });
  });

  describe("ingestion suspension boundary", () => {
    const suspended = ctx([
      allowProject([wildcard], [{ orgId: ORG, projectIds: [PRJ] }]),
      denyProject(
        ["traces:create", "scores:create", "media:create"],
        [{ orgId: ORG, projectIds: [PRJ] }],
      ),
      denyProject(
        ["mcp:access"],
        [{ orgId: ORG, projectIds: [PRJ] }],
        "mcp_disabled",
      ),
    ]);
    it.each([
      ["traces:create", systemRuleMessages.ingestion_suspended],
      ["scores:create", systemRuleMessages.ingestion_suspended],
      ["media:create", systemRuleMessages.ingestion_suspended],
      ["mcp:access", systemRuleMessages.mcp_disabled],
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
    it("a project audit grant also satisfies its org's org-level check", () => {
      const projectAudit = ctx([
        allowProject(["auditLogs:read"], [{ orgId: ORG, projectIds: [PRJ] }]),
      ]);
      expect(
        authorize(projectAudit, "auditLogs:read", { projectId: PRJ }).success,
      ).toBe(true);
      expect(
        authorize(projectAudit, "auditLogs:read", { orgId: ORG }).success,
      ).toBe(true);
    });
    it("any project action is org-checkable, returning the residual for list filtering", () => {
      const c = ctx([
        allowProject(["projects:read"], [{ orgId: ORG, projectIds: [PRJ] }]),
      ]);
      expect(authorize(c, "projects:read", { projectId: PRJ }).success).toBe(
        true,
      );
      const list = authorize(c, "projects:read", { orgId: ORG });
      expect(list.success && list.access).toEqual({
        includes: [{ orgId: ORG, projectIds: [PRJ] }],
        excludes: [],
      });
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
        resources: [{ orgId: ORG, projectIds: [PRJ] }],
        effect: "allow",
      };
      const orgResources: OrganizationPolicy = {
        kind: "organization",
        source: { kind: "role", id: "OWNER" },
        actions: ["projects:create"],
        // @ts-expect-error an org policy cannot carry a project list
        resources: [{ orgId: ORG, projectIds: [PRJ] }],
        effect: "allow",
      };
      const projectResources: ProjectPolicy = {
        kind: "project",
        source: { kind: "role", id: "OWNER" },
        actions: ["prompts:read"],
        // @ts-expect-error a project policy always materializes its projects
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
      const d = {
        success: true,
        access: { includes: [], excludes: [] },
      } as Decision;
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
