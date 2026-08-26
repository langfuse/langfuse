/// <reference types="vitest/importMeta" />
/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/parity-classification`,
 * LFE-15458). The PIP: `ContextResolver.resolveContext` turns an authenticated
 * credential into an `AuthorizationContext`. Class shape from the RFC (§PIP):
 * constructor-injected collaborators (prisma for roles, redis for caching) with
 * defaults; `resolveContext` the exposed method. Replaces the retracted
 * `resolveContextFromLegacyScope` (LFE-15038), which resolved from
 * `verifyAuthHeaderAndReturnScope`'s output — the thing LFE-15033 deletes —
 * making shadow parity circular. Run:
 * `pnpm --filter web run test:in-source resolveContext.prototype`.
 *
 * The bridge is the Prisma `ApiKey` row itself, not a lossy derivative — plus
 * the credential presentation (`publicKey` | `privateKey` | `adminKey`) the
 * verifier already established, which the row cannot carry: proven in
 * `apiAuth.ts`, the same PROJECT row is full-access under `privateKey` and
 * `scores`-only under `publicKey`. `OrgEnrichedApiKey`, today's cache value that
 * fused row and enrichment, is retired. The Verifier is LFE-15032's slice.
 */

import { type ApiKey } from "@langfuse/shared/src/db";
import { InternalServerError } from "@langfuse/shared";

import {
  apiKeyAccessRights,
  apiKeySystemRules,
} from "@/src/features/rbac/constants/apiKeyAccessRights.prototype";
import {
  authorize,
  wildcard,
  type AuthorizationContext,
  type ErrorResult,
  type Policy,
  type Principal,
  type PrincipalOrganization,
  type Resource,
  type SystemPolicy,
  type Success,
} from "./policy.prototype";

/** defaultOrgRepo is the prototype's stand-in for the prisma-backed enricher; production wires the real client. */
const defaultOrgRepo: OrgRepo = {
  enrich: async () => {
    throw new Error("PROTOTYPE(LFE-15458): wire real prisma OrgRepo");
  },
};

/** defaultContextCache is an in-memory stand-in for the redis-backed resolver cache (LFE-15054). */
const defaultContextCache: ContextCache = createContextCache();

/** ContextResolver is the PIP: it resolves an authenticated credential into its `AuthorizationContext`, caching resolved policies. */
export class ContextResolver {
  constructor(
    private readonly orgs: OrgRepo = defaultOrgRepo,
    private readonly cache: ContextCache = defaultContextCache,
  ) {}

  /** resolveContext returns the credential's authorization context, read-through cached by (apiKeyId, presentation). */
  async resolveContext(
    input: ResolveContextParams,
  ): Promise<ResolveContextResult> {
    if (input.authorization === "adminKey") {
      return { success: true, context: adminContext() };
    }

    const { apiKey, authorization } = input;
    if (apiKey.orgId === null) {
      return {
        success: false,
        error: new InternalServerError(`key ${apiKey.id} has no orgId`),
      };
    }
    // public-key-presentation validity — including the blast-radius rule gating it to scope === "PROJECT" so a new role can't inherit public-key score creation — is the Verifier's call (LFE-15032); the resolver trusts what it is handed
    const key = `${apiKey.id}:${authorization}`;
    const cached = await this.cache.read(key);
    if (cached) return { success: true, context: cached };

    const context = materialize(
      apiKey,
      authorization,
      await this.orgs.enrich(apiKey.orgId),
    );
    await this.cache.write(key, context);
    return { success: true, context };
  }

  /** invalidate evicts a key's contexts, or every context under an org, after a mutation — the resolver half of ApiAuthService.invalidate (LFE-15054). */
  async invalidate(target: InvalidateParams): Promise<void> {
    await this.cache.invalidate(target);
  }
}

/** defaultContextResolver is the ContextResolver on its default collaborators. */
export const defaultContextResolver = new ContextResolver();

/** materialize is the pure legacy expansion table: the `ApiKey` row and its presentation to the policies the credential implies. */
function materialize(
  apiKey: ApiKey,
  authorization: "publicKey" | "privateKey",
  org: OrgEnrichment,
): AuthorizationContext {
  const principal: Principal = {
    kind: "apiKey",
    apiKeyId: apiKey.id,
    // attribution the legacy scope structurally cannot carry (LFE-15042)
    userId: apiKey.createdByUserId,
    organizations: [
      {
        orgId: org.orgId,
        plan: org.plan,
        rateLimitConfig: org.rateLimitConfig,
        projectIds: org.projectIds,
      },
    ],
    boundResource: boundResourceFor(apiKey),
  };

  // a public-key presentation resolves to the SCORES_INGEST role; otherwise the key's scope role. Suspension adds project-kind denies. Each binds to the key's project/org.
  const grants =
    authorization === "publicKey"
      ? apiKeyAccessRights.SCORES_INGEST
      : apiKeyAccessRights[apiKey.scope];
  // name the rules an ingestion suspension attaches, so a future system rule is not swept in blindly
  const suspension =
    apiKey.projectId !== null && org.isIngestionSuspended
      ? [
          ...apiKeySystemRules.ingestion_suspended,
          ...apiKeySystemRules.mcp_suspended,
        ]
      : [];
  const policies = [...grants, ...suspension].map((p) => bind(p, principal));
  return { principal, policies };
}

/** createContextCache is the prototype's in-memory ContextCache, with org and apiKey reverse indices so invalidate can evict by either (LFE-15054). */
function createContextCache(): ContextCache {
  const store = new Map<string, AuthorizationContext>();
  const byApiKey = new Map<string, Set<string>>();
  const byOrg = new Map<string, Set<string>>();
  const index = (map: Map<string, Set<string>>, id: string, key: string) => {
    const keys = map.get(id) ?? new Set<string>();
    keys.add(key);
    map.set(id, keys);
  };
  return {
    read: async (key) => store.get(key),
    write: async (key, context) => {
      store.set(key, context);
      if (context.principal.kind !== "apiKey") return;
      index(byApiKey, context.principal.apiKeyId, key);
      for (const org of context.principal.organizations) {
        index(byOrg, org.orgId, key);
      }
    },
    invalidate: async (target) => {
      const map = "apiKeyId" in target ? byApiKey : byOrg;
      const id = "apiKeyId" in target ? target.apiKeyId : target.orgId;
      for (const key of map.get(id) ?? []) store.delete(key);
      map.delete(id);
    },
  };
}

/** bind fixes a resource-less SystemPolicy to the resources the principal covers, by the policy's kind. */
function bind(policy: SystemPolicy, principal: Principal): Policy {
  return policy.kind === "organization"
    ? { ...policy, resources: orgResources(principal) }
    : { ...policy, resources: projectResources(principal) };
}

/** projectResources are the project ids a project-kind policy binds to: the bound project; the bound org's projects; or every org's projects — the wildcard for admin. */
function projectResources(principal: Principal): Policy["resources"] {
  if (principal.kind === "admin") return wildcard;
  const bound = principal.kind === "apiKey" ? principal.boundResource : undefined;
  if (bound && "projectId" in bound) return [bound.projectId];
  const orgs =
    bound && "orgId" in bound
      ? principal.organizations.filter((o) => o.orgId === bound.orgId)
      : principal.organizations;
  return orgs.flatMap((o) => o.projectIds);
}

/** orgResources are the org ids an org-kind policy binds to: the bound org, or every org — the wildcard for admin. */
function orgResources(principal: Principal): Policy["resources"] {
  if (principal.kind === "admin") return wildcard;
  const bound = principal.kind === "apiKey" ? principal.boundResource : undefined;
  const orgs =
    bound && "orgId" in bound
      ? principal.organizations.filter((o) => o.orgId === bound.orgId)
      : principal.organizations;
  return orgs.map((o) => o.orgId);
}

/** adminContext is the admin context — no key row; the ADMIN role, whose policies bind to the wildcard resource; the core never sees the secret (LFE-15026). */
function adminContext(): AuthorizationContext {
  const principal: Principal = { kind: "admin", userId: null };
  return {
    principal,
    policies: apiKeyAccessRights.ADMIN.map((policy) => bind(policy, principal)),
  };
}

/** boundResourceFor is the legacy single-target a request resolves against with no header: the bound project, or the org node for an org key. */
function boundResourceFor(apiKey: ApiKey): Resource {
  if (apiKey.scope === "ORGANIZATION") return { orgId: apiKey.orgId! };
  return { projectId: apiKey.projectId! };
}

/** ResolveContextParams is an authenticated credential: an api key with how it was presented, or the admin key (RFC §PIP). */
export type ResolveContextParams =
  | { authorization: "publicKey" | "privateKey"; apiKey: ApiKey }
  | { authorization: "adminKey" };

/** ResolveContextResult is the resolved context or a typed failure; `resolveContext` returns, never throws. */
export type ResolveContextResult =
  | (Success & { context: AuthorizationContext })
  | ErrorResult<InternalServerError>;

/** OrgRepo resolves an org's enrichment — the prisma-backed collaborator (RFC: prisma). */
export type OrgRepo = {
  enrich: (orgId: string) => Promise<OrgEnrichment>;
};

/** ContextCache caches resolved contexts by key with org/apiKey reverse indices for invalidation — the redis-backed collaborator (RFC: redis, LFE-15054). */
export type ContextCache = {
  read: (key: string) => Promise<AuthorizationContext | undefined>;
  write: (key: string, context: AuthorizationContext) => Promise<void>;
  invalidate: (target: InvalidateParams) => Promise<void>;
};

/** InvalidateParams selects the entries to evict: one api key's contexts, or every context under an org (LFE-15054). */
export type InvalidateParams = { apiKeyId: string } | { orgId: string };

/** OrgEnrichment is the org's PrincipalOrganization plus the transient suspension signal that becomes system-deny policies — never stored on the principal (LFE-15042). */
export type OrgEnrichment = PrincipalOrganization & {
  isIngestionSuspended: boolean;
};

if (import.meta.vitest) {
  const { describe, it, expect, vi } = import.meta.vitest;

  const ORG = "org_1";
  const PRJ = "prj_1";
  const OTHER_PRJ = "prj_2";
  const USER = "user_1";

  const enrichment = (over: Partial<OrgEnrichment> = {}): OrgEnrichment => ({
    orgId: ORG,
    plan: "cloud:hobby",
    rateLimitConfig: [],
    projectIds: [PRJ, OTHER_PRJ],
    isIngestionSuspended: false,
    ...over,
  });
  const mapCache = createContextCache;
  const resolver = (
    over: Partial<OrgEnrichment> = {},
  ): { resolver: ContextResolver; enrich: ReturnType<typeof vi.fn> } => {
    const enrich = vi.fn(async () => enrichment(over));
    return { resolver: new ContextResolver({ enrich }, mapCache()), enrich };
  };
  const contextOf = (result: ResolveContextResult): AuthorizationContext => {
    if (!result.success) throw result.error;
    return result.context;
  };

  const apiKey = (over: Partial<ApiKey> = {}): ApiKey => ({
    id: "key_p",
    createdAt: new Date(0),
    note: null,
    publicKey: "pk-lf-1",
    hashedSecretKey: "hsk",
    fastHashedSecretKey: "fhsk",
    displaySecretKey: "sk-...abc",
    lastUsedAt: null,
    expiresAt: null,
    isInAppAgentKey: false,
    projectId: PRJ,
    orgId: ORG,
    scope: "PROJECT",
    createdByUserId: USER,
    createdByApiKeyId: null,
    ...over,
  });
  const orgKey = (over: Partial<ApiKey> = {}): ApiKey =>
    apiKey({ id: "key_o", scope: "ORGANIZATION", projectId: null, ...over });

  describe("the class seam: constructor-injected collaborators with defaults", () => {
    it("resolves the admin key on the default resolver, no collaborators touched", async () => {
      const ctx = contextOf(
        await defaultContextResolver.resolveContext({ authorization: "adminKey" }),
      );
      expect(ctx.principal.kind).toBe("admin");
      expect(authorize(ctx, "prompts:read", { projectId: "any" }).success).toBe(
        true,
      );
      expect(authorize(ctx, "projects:create", { orgId: "any" }).success).toBe(
        true,
      );
    });
  });

  describe("presentation rides in the input (RFC §PIP)", () => {
    it("the same row is full-access under privateKey and scores-only under publicKey", async () => {
      const { resolver: r } = resolver();
      const priv = contextOf(
        await r.resolveContext({ authorization: "privateKey", apiKey: apiKey() }),
      );
      const pub = contextOf(
        await r.resolveContext({ authorization: "publicKey", apiKey: apiKey() }),
      );
      expect(authorize(priv, "traces:read", { projectId: PRJ }).success).toBe(
        true,
      );
      expect(authorize(pub, "scores:create", { projectId: PRJ }).success).toBe(
        true,
      );
      expect(authorize(pub, "traces:read", { projectId: PRJ }).success).toBe(
        false,
      );
    });
  });

  describe("resolver cache: read-through then write-back", () => {
    it("materializes once per (key, presentation), then serves from cache", async () => {
      const { resolver: r, enrich } = resolver();
      await r.resolveContext({ authorization: "privateKey", apiKey: apiKey() });
      await r.resolveContext({ authorization: "privateKey", apiKey: apiKey() });
      expect(enrich).toHaveBeenCalledTimes(1);
    });
    it("caches presentations separately — publicKey and privateKey do not collide", async () => {
      const { resolver: r, enrich } = resolver();
      await r.resolveContext({ authorization: "privateKey", apiKey: apiKey() });
      await r.resolveContext({ authorization: "publicKey", apiKey: apiKey() });
      expect(enrich).toHaveBeenCalledTimes(2);
    });
  });

  describe("invalidate evicts the resolver cache (LFE-15054)", () => {
    it("invalidate({ apiKeyId }) forces the next resolve to re-materialize", async () => {
      const { resolver: r, enrich } = resolver();
      await r.resolveContext({ authorization: "privateKey", apiKey: apiKey() });
      await r.invalidate({ apiKeyId: "key_p" });
      await r.resolveContext({ authorization: "privateKey", apiKey: apiKey() });
      expect(enrich).toHaveBeenCalledTimes(2);
    });
    it("invalidate({ orgId }) evicts every key under the org", async () => {
      const { resolver: r, enrich } = resolver();
      await r.resolveContext({ authorization: "privateKey", apiKey: apiKey() });
      await r.invalidate({ orgId: ORG });
      await r.resolveContext({ authorization: "privateKey", apiKey: apiKey() });
      expect(enrich).toHaveBeenCalledTimes(2);
    });
  });

  describe("expansion table: scope PROJECT, privateKey", () => {
    it("grants exactly the map's project actions, resolved from apiKeyAccessRights", async () => {
      const ctx = contextOf(
        await resolver().resolver.resolveContext({
          authorization: "privateKey",
          apiKey: apiKey(),
        }),
      );
      const projectPolicy = ctx.policies.find(
        (p) => p.kind === "project" && p.effect === "allow",
      );
      expect(projectPolicy?.actions).toEqual(
        apiKeyAccessRights.PROJECT[0].actions,
      );
    });
    it("grants the full project vocabulary over the bound project only", async () => {
      const ctx = contextOf(
        await resolver().resolver.resolveContext({
          authorization: "privateKey",
          apiKey: apiKey(),
        }),
      );
      expect(authorize(ctx, "prompts:read", { projectId: PRJ }).success).toBe(
        true,
      );
      expect(
        authorize(ctx, "prompts:read", { projectId: OTHER_PRJ }).success,
      ).toBe(false);
    });
    it("does not satisfy org-level actions", async () => {
      const ctx = contextOf(
        await resolver().resolver.resolveContext({
          authorization: "privateKey",
          apiKey: apiKey(),
        }),
      );
      expect(authorize(ctx, "projects:read", { orgId: ORG }).success).toBe(
        false,
      );
    });
    it("binds the request's default target to the project", async () => {
      const ctx = contextOf(
        await resolver().resolver.resolveContext({
          authorization: "privateKey",
          apiKey: apiKey(),
        }),
      );
      expect(
        ctx.principal.kind === "apiKey" && ctx.principal.boundResource,
      ).toEqual({ projectId: PRJ });
    });
  });

  describe("expansion table: scope ORGANIZATION, privateKey", () => {
    it("grants the full org vocabulary, every org action", async () => {
      const ctx = contextOf(
        await resolver().resolver.resolveContext({
          authorization: "privateKey",
          apiKey: orgKey(),
        }),
      );
      expect(authorize(ctx, "projects:read", { orgId: ORG }).success).toBe(true);
      expect(authorize(ctx, "projects:create", { orgId: ORG }).success).toBe(
        true,
      );
    });
    it("grants no project-level access", async () => {
      const ctx = contextOf(
        await resolver().resolver.resolveContext({
          authorization: "privateKey",
          apiKey: orgKey(),
        }),
      );
      expect(authorize(ctx, "traces:read", { projectId: PRJ }).success).toBe(
        false,
      );
    });
    it("carries the org's non-deleted project ids", async () => {
      const ctx = contextOf(
        await resolver().resolver.resolveContext({
          authorization: "privateKey",
          apiKey: orgKey(),
        }),
      );
      const org =
        ctx.principal.kind === "apiKey" ? ctx.principal.organizations[0] : null;
      expect(org?.projectIds).toEqual([PRJ, OTHER_PRJ]);
    });
  });

  describe("attribution: createdByUserId to principal.userId", () => {
    it("carries the creating user id the legacy scope drops", async () => {
      const ctx = contextOf(
        await resolver().resolver.resolveContext({
          authorization: "privateKey",
          apiKey: apiKey(),
        }),
      );
      expect(ctx.principal.kind === "apiKey" && ctx.principal.userId).toBe(USER);
    });
    it("is null for a key with no creator", async () => {
      const ctx = contextOf(
        await resolver().resolver.resolveContext({
          authorization: "privateKey",
          apiKey: apiKey({ createdByUserId: null }),
        }),
      );
      expect(ctx.principal.kind === "apiKey" && ctx.principal.userId).toBeNull();
    });
  });

  describe("org suspension materializes as two system denies", () => {
    const suspended = () =>
      resolver({ isIngestionSuspended: true }).resolver.resolveContext({
        authorization: "privateKey",
        apiKey: apiKey(),
      });
    it.each([
      ["traces:create"],
      ["scores:create"],
      ["media:create"],
      ["mcp:access"],
    ] as const)("denies %s under suspension", async (action) => {
      const ctx = contextOf(await suspended());
      expect(authorize(ctx, action, { projectId: PRJ }).success).toBe(false);
    });
    it("leaves reads available under suspension", async () => {
      const ctx = contextOf(await suspended());
      expect(authorize(ctx, "traces:read", { projectId: PRJ }).success).toBe(
        true,
      );
    });
  });

  describe("resource binding by principal", () => {
    const org: PrincipalOrganization = {
      orgId: ORG,
      plan: "cloud:hobby",
      rateLimitConfig: [],
      projectIds: [PRJ, OTHER_PRJ],
    };
    const keyPrincipal = (boundResource?: Resource): Principal => ({
      kind: "apiKey",
      apiKeyId: "key_1",
      userId: null,
      organizations: [org],
      boundResource,
    });

    it("admin binds to the wildcard resource for both kinds", () => {
      const admin: Principal = { kind: "admin", userId: null };
      expect(projectResources(admin)).toEqual(wildcard);
      expect(orgResources(admin)).toEqual(wildcard);
    });
    it("a project-bound key binds to that project alone", () => {
      expect(projectResources(keyPrincipal({ projectId: PRJ }))).toEqual([PRJ]);
    });
    it("an org-bound key binds to that org's materialized projects", () => {
      expect(projectResources(keyPrincipal({ orgId: ORG }))).toEqual([
        PRJ,
        OTHER_PRJ,
      ]);
      expect(orgResources(keyPrincipal({ orgId: ORG }))).toEqual([ORG]);
    });
    it("an unbound key binds to every org's projects", () => {
      expect(projectResources(keyPrincipal())).toEqual([PRJ, OTHER_PRJ]);
    });
  });
}
