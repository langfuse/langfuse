import { type ApiKey } from "@langfuse/shared/src/db";
import { CloudConfigSchema, InternalServerError } from "@langfuse/shared";

import { apiKeyAccessRights } from "@/src/features/rbac/constants/apiKeyAccessRights";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import {
  OrganizationRepository,
  type OrganizationWithProjects,
} from "./organizationRepository";
import {
  wildcard,
  type AuthorizationContext,
  type ErrorResult,
  type Policy,
  type Principal,
  type PrincipalOrganization,
  type Resource,
  type Success,
  type SystemPolicy,
} from "./types";

/** ContextResolver materializes an authenticated credential into its `AuthorizationContext`, loading and enriching the org it implies. */
export class ContextResolver {
  constructor(
    private readonly orgs: OrganizationRepository = new OrganizationRepository(),
  ) {}

  /** resolve turns a verified credential into its context, collapsing a missing org to a 500 invariant break. */
  async resolve(params: ResolveContextParams): Promise<Resolved> {
    if (params.authorization === "admin") {
      return { success: true, context: adminContext() };
    }
    const org = await this.getPrincipalOrganization({ apiKey: params.apiKey });
    if (!org.success) return org;
    return {
      success: true,
      context: materialize(
        params.apiKey,
        params.authorization,
        org.organization,
      ),
    };
  }

  /** getPrincipalOrganization loads and derives the key's `PrincipalOrganization`, mapping a missing org to a 500 invariant break. */
  private async getPrincipalOrganization({
    apiKey,
  }: {
    apiKey: ApiKey;
  }): Promise<
    | (Success & { organization: PrincipalOrganization })
    | ErrorResult<InternalServerError>
  > {
    if (apiKey.orgId === null) {
      return {
        success: false,
        error: new InternalServerError(`key ${apiKey.id} has no orgId`),
      };
    }
    const found = await this.orgs.getOrganization(apiKey.orgId);
    if (!found.success) {
      return {
        success: false,
        error:
          found.error instanceof InternalServerError
            ? found.error
            : new InternalServerError(found.error.message),
      };
    }
    return {
      success: true,
      organization: toPrincipalOrganization(found.organization),
    };
  }
}

/** materialize expands the `ApiKey` row and its presentation into the policies the credential implies. */
function materialize(
  apiKey: ApiKey,
  authorization: "publicKey" | "privateKey",
  org: PrincipalOrganization,
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

/** toPrincipalOrganization derives an org's `PrincipalOrganization` caps and liveness from its raw row. */
function toPrincipalOrganization(
  org: OrganizationWithProjects,
): PrincipalOrganization {
  const cloudConfig = getCloudConfig(org);
  return {
    orgId: org.id,
    plan: getOrganizationPlanServerSide(cloudConfig),
    rateLimitConfig: cloudConfig?.rateLimitOverrides ?? [],
    projectIds: org.projects.map((p) => p.id),
    isIngestionSuspended: org.cloudFreeTierUsageThresholdState === "BLOCKED",
  };
}

/** getCloudConfig parses an org's raw cloud-config json, or undefined when unset. */
function getCloudConfig(
  org: OrganizationWithProjects,
): CloudConfigSchema | undefined {
  return org.cloudConfig ? CloudConfigSchema.parse(org.cloudConfig) : undefined;
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

/** ResolveContextParams is a verified credential: an api key with how it was presented, or the admin key. */
export type ResolveContextParams =
  | {
      authorization: "publicKey" | "privateKey";
      apiKey: ApiKey;
    }
  | { authorization: "admin" };

/** Resolved is the materialized context, or a 500 when a verified key's org is missing. */
export type Resolved =
  | (Success & { context: AuthorizationContext })
  | ErrorResult<InternalServerError>;
