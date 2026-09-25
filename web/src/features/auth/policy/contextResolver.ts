import {
  type ApiKey,
  type PrismaClient,
  prisma as defaultPrisma,
} from "@langfuse/shared/src/db";
import { CloudConfigSchema, type InternalServerError } from "@langfuse/shared";
import {
  ApiKeyId,
  OrganizationId,
  ProjectId,
  SystemRoleId,
} from "@langfuse/shared/rbac";

import { apiKeyAccessRights } from "@/src/features/rbac/constants/apiKeyAccessRights";
import { getRolesForPrincipal } from "@/src/features/rbac/getRolesForPrincipal";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server";
import {
  OrganizationRepository,
  type GetOrganizationResult,
  type OrganizationWithProjects,
} from "./organizationRepository";
import {
  internalServerError,
  type AuthorizationContext,
  type BoundResource,
  type ErrorResult,
  type Policy,
  type Principal,
  type PrincipalOrganization,
  type Success,
} from "./types";

/** ContextResolver materializes an authenticated credential into its `AuthorizationContext`, loading and enriching the org it implies. */
export class ContextResolver {
  constructor(
    private readonly orgs: OrganizationRepository = new OrganizationRepository(),
    private readonly prisma: PrismaClient = defaultPrisma,
  ) {}

  /** resolve turns a verified credential into its context, collapsing a missing org to a 500 invariant break. */
  async resolve(params: ResolveContextParams): Promise<Resolved> {
    if (params.authorization === "admin") {
      return { success: true, context: adminContext() };
    }
    const org = await this.getPrincipalOrganization(params.apiKey);
    if (!org.success) return org;
    return {
      success: true,
      context: await materialize(
        params.apiKey,
        params.authorization,
        org.organization,
        this.prisma,
      ),
    };
  }

  /** getPrincipalOrganization loads and derives the key's `PrincipalOrganization`, collapsing a null miss to a 500 invariant break. */
  private async getPrincipalOrganization(
    apiKey: ApiKey,
  ): Promise<
    | (Success & { organization: PrincipalOrganization })
    | ErrorResult<InternalServerError>
  > {
    const found = await this.loadOrganization(apiKey);
    if (!found.success) return found;
    if (!found.organization) {
      return internalServerError(
        `verified key ${apiKey.id} resolved to no organization`,
      );
    }
    return {
      success: true,
      organization: toPrincipalOrganization(found.organization),
    };
  }

  /** loadOrganization loads the key's org by its scope: an org key by orgId, a project key by its bound projectId. */
  private async loadOrganization(
    apiKey: ApiKey,
  ): Promise<GetOrganizationResult> {
    if (apiKey.scope === "ORGANIZATION") {
      if (apiKey.orgId === null) {
        return internalServerError(`org key ${apiKey.id} has no orgId`);
      }
      return this.orgs.getOrganizationByOrgId(apiKey.orgId);
    }
    if (apiKey.projectId === null) {
      return internalServerError(`project key ${apiKey.id} has no projectId`);
    }
    return this.orgs.getOrganizationByProjectId(apiKey.projectId);
  }
}

/** materialize expands the `ApiKey` row and its presentation into the policies the credential implies. */
async function materialize(
  apiKey: ApiKey,
  authorization: "publicKey" | "privateKey",
  org: PrincipalOrganization,
  prisma: PrismaClient,
): Promise<AuthorizationContext> {
  const principal: Principal = {
    kind: "apiKey",
    apiKeyId: apiKey.id,
    userId: apiKey.createdByUserId,
    isInAppAgentKey: apiKey.isInAppAgentKey,
    publicKey: apiKey.publicKey,
    scope: apiKey.scope,
    presentation: authorization,
    organizations: [org],
    boundResource: boundResourceFor(apiKey, org),
  };

  const policies =
    authorization === "publicKey"
      ? publicBearerPolicies(apiKey, org)
      : (await getRolesForPrincipal(ApiKeyId(apiKey.id), prisma)).flatMap(
          (role) => role.policies,
        );
  return { principal, policies };
}

/** publicBearerPolicies narrows a public-key bearer to scores:create on its own project, regardless of any stored assignment. */
function publicBearerPolicies(
  apiKey: ApiKey,
  org: PrincipalOrganization,
): Policy[] {
  const tenantId = OrganizationId(org.orgId);
  const resources = [ProjectId(apiKey.projectId!)];
  return apiKeyAccessRights.SCORES_INGEST.map((policy) => ({
    id: `${SystemRoleId("SCORES_INGEST")}:${policy.resourceKind}`,
    roleId: SystemRoleId("SCORES_INGEST"),
    tenantId,
    effect: policy.effect,
    actions: policy.actions,
    resources,
  }));
}

/** adminContext is the admin context: no key row and no policies; the PDP grants the superuser directly. */
function adminContext(): AuthorizationContext {
  const principal: Principal = { kind: "admin", userId: null };
  return { principal, policies: [] };
}

/** boundResourceFor is the target a request resolves against with no header: the key's org, narrowed to its project when the key is project-scoped. */
function boundResourceFor(
  apiKey: ApiKey,
  org: PrincipalOrganization,
): BoundResource {
  if (apiKey.scope === "ORGANIZATION") return { orgId: org.orgId };
  return { orgId: org.orgId, projectId: apiKey.projectId! };
}

/** toPrincipalOrganization derives an org's `PrincipalOrganization` caps and liveness from its raw row. */
function toPrincipalOrganization(
  org: OrganizationWithProjects,
): PrincipalOrganization {
  const cloudConfig = getCloudConfig(org);
  return {
    orgId: org.id,
    organizationCreatedAt: org.createdAt.toISOString(),
    plan: getOrganizationPlanServerSide(cloudConfig),
    rateLimitOverrides: cloudConfig?.rateLimitOverrides ?? [],
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
