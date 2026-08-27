import { type ApiKey } from "@langfuse/shared/src/db";
import { InternalServerError } from "@langfuse/shared";

import { apiKeyAccessRights } from "@/src/features/rbac/constants/apiKeyAccessRights";
import {
  wildcard,
  type AuthorizationContext,
  type ErrorResult,
  type Policy,
  type Principal,
  type PrincipalOrganization,
  type Resource,
  type SystemPolicy,
  type Success,
} from "./types";

/** notWiredOrgRepo is the default org enricher until the Verifier slice injects the prisma-backed one. */
const notWiredOrgRepo: OrgRepo = {
  enrich: async () => {
    throw new InternalServerError("ContextResolver: OrgRepo not wired");
  },
};

/** ContextResolver resolves an authenticated credential into its `AuthorizationContext`, caching resolved policies by `(apiKeyId, presentation)`. */
export class ContextResolver {
  constructor(
    private readonly orgs: OrgRepo = notWiredOrgRepo,
    private readonly cache: ContextCache = createContextCache(),
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

  /** invalidate evicts a key's contexts, or every context under an org. */
  async invalidate(target: InvalidateParams): Promise<void> {
    await this.cache.invalidate(target);
  }
}

/** defaultContextResolver is the ContextResolver on its default collaborators. */
export const defaultContextResolver = new ContextResolver();

/** materialize expands the `ApiKey` row and its presentation into the policies the credential implies. */
function materialize(
  apiKey: ApiKey,
  authorization: "publicKey" | "privateKey",
  org: OrgEnrichment,
): AuthorizationContext {
  const principal: Principal = {
    kind: "apiKey",
    apiKeyId: apiKey.id,
    userId: apiKey.createdByUserId,
    organizations: [org],
    boundResource: boundResourceFor(apiKey),
  };

  const grants =
    authorization === "publicKey"
      ? apiKeyAccessRights.SCORES_INGEST
      : apiKeyAccessRights[apiKey.scope];
  const policies = grants.map((p) => bind(p, principal));
  return { principal, policies };
}

/** adminContext is the admin context: no key row, the ADMIN role bound to the wildcard resource. */
function adminContext(): AuthorizationContext {
  const principal: Principal = { kind: "admin", userId: null };
  return {
    principal,
    policies: apiKeyAccessRights.ADMIN.map((policy) => bind(policy, principal)),
  };
}

/** createContextCache is the in-memory ContextCache with org and apiKey reverse indices for invalidation. */
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

/** projectResources are the project ids a project-kind policy binds to: the bound project, the bound org's projects, or the wildcard for admin. */
function projectResources(principal: Principal): Policy["resources"] {
  if (principal.kind === "admin") return wildcard;
  const bound =
    principal.kind === "apiKey" ? principal.boundResource : undefined;
  if (bound && "projectId" in bound) return [bound.projectId];
  const orgs =
    bound && "orgId" in bound
      ? principal.organizations.filter((o) => o.orgId === bound.orgId)
      : principal.organizations;
  return orgs.flatMap((o) => o.projectIds);
}

/** orgResources are the org ids an org-kind policy binds to: the bound org, or the wildcard for admin. */
function orgResources(principal: Principal): Policy["resources"] {
  if (principal.kind === "admin") return wildcard;
  const bound =
    principal.kind === "apiKey" ? principal.boundResource : undefined;
  const orgs =
    bound && "orgId" in bound
      ? principal.organizations.filter((o) => o.orgId === bound.orgId)
      : principal.organizations;
  return orgs.map((o) => o.orgId);
}

/** boundResourceFor is the legacy single-target a request resolves against with no header. */
function boundResourceFor(apiKey: ApiKey): Resource {
  if (apiKey.scope === "ORGANIZATION") return { orgId: apiKey.orgId! };
  return { projectId: apiKey.projectId! };
}

/** ResolveContextParams is an authenticated credential: an api key with how it was presented, or the admin key. */
export type ResolveContextParams =
  | { authorization: "publicKey" | "privateKey"; apiKey: ApiKey }
  | { authorization: "adminKey" };

/** ResolveContextResult is the resolved context or a typed failure; resolveContext returns, never throws. */
export type ResolveContextResult =
  | (Success & { context: AuthorizationContext })
  | ErrorResult<InternalServerError>;

/** OrgRepo resolves an org's enrichment — the prisma-backed collaborator. */
export type OrgRepo = {
  enrich: (orgId: string) => Promise<OrgEnrichment>;
};

/** ContextCache caches resolved contexts by key with org/apiKey reverse indices for invalidation. */
export type ContextCache = {
  read: (key: string) => Promise<AuthorizationContext | undefined>;
  write: (key: string, context: AuthorizationContext) => Promise<void>;
  invalidate: (target: InvalidateParams) => Promise<void>;
};

/** InvalidateParams selects the entries to evict: one api key's contexts, or every context under an org. */
export type InvalidateParams = { apiKeyId: string } | { orgId: string };

/** OrgEnrichment is the org's PrincipalOrganization the resolver fetches at materialization. */
export type OrgEnrichment = PrincipalOrganization;

/** __test exposes module-private helpers for the colocated unit test. */
export const __test = { createContextCache };
