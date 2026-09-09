import {
  ForbiddenError,
  InternalServerError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { type ApiAccessScope } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

import { env } from "@/src/env.mjs";
import {
  type AuthorizationContext,
  type ErrorResult,
  type Principal,
  type PrincipalOrganization,
  type Success,
} from "./types";

/** toApiAccessScope maps an authorized context's principal onto the ApiAccessScope for the resolved org or project target. */
export async function toApiAccessScope(
  context: AuthorizationContext,
  target: ScopeTarget,
): Promise<ScopeResult> {
  const { principal } = context;
  return "orgId" in target
    ? orgScope(principal, target.orgId)
    : projectScope(principal, target.projectId);
}

/** orgScope maps an authorized principal onto the organization-level scope. */
function orgScope(principal: Principal, orgId: string): ScopeResult {
  if (principal.kind !== "apiKey") {
    return invariantBreak(
      `unexpected principal kind on the org seam: ${principal.kind}`,
    );
  }
  const org = principal.organizations.find((o) => o.orgId === orgId);
  if (!org) {
    return invariantBreak(
      `api key ${principal.apiKeyId} resolved to no organization ${orgId}`,
    );
  }
  return {
    success: true,
    scope: {
      ...credentialFields(principal, org),
      projectId: null,
      accessLevel: "organization",
    },
  };
}

/** projectScope maps an authorized principal onto the project-level scope. */
async function projectScope(
  principal: Principal,
  projectId: string,
): Promise<ScopeResult> {
  if (principal.kind === "admin") return adminScope(projectId);
  if (principal.kind !== "apiKey") {
    return invariantBreak(
      `unexpected principal kind on the project seam: ${principal.kind}`,
    );
  }
  const org = principal.organizations[0];
  if (!org) {
    return invariantBreak(
      `api key ${principal.apiKeyId} resolved to no organization`,
    );
  }
  return {
    success: true,
    scope: {
      ...credentialFields(principal, org),
      projectId,
      accessLevel:
        principal.presentation === "publicKey" ? "scores" : "project",
    },
  };
}

/** adminScope synthesizes the legacy self-host admin scope for a project. */
async function adminScope(projectId: string): Promise<ScopeResult> {
  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    return {
      success: false,
      error: new ForbiddenError(
        "Admin API key auth is not available on Langfuse Cloud",
      ),
    };
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId, deletedAt: null },
    select: { id: true, orgId: true },
  });
  if (!project) {
    return {
      success: false,
      error: new LangfuseNotFoundError("Project not found"),
    };
  }
  return {
    success: true,
    scope: {
      projectId: project.id,
      accessLevel: "project",
      orgId: project.orgId,
      plan: "oss",
      rateLimitOverrides: [],
      apiKeyId: "ADMIN_API_KEY",
      publicKey: "ADMIN_API_KEY",
      isIngestionSuspended: false,
      isInAppAgentKey: false,
    },
  };
}

/** credentialFields are the scope fields both access levels read off the key and its organization. */
function credentialFields(
  principal: ApiKeyPrincipal,
  org: PrincipalOrganization,
) {
  return {
    orgId: org.orgId,
    plan: org.plan,
    rateLimitOverrides: org.rateLimitOverrides,
    apiKeyId: principal.apiKeyId,
    publicKey: principal.publicKey,
    isIngestionSuspended: org.isIngestionSuspended,
    isInAppAgentKey: principal.isInAppAgentKey,
  };
}

/** invariantBreak is a 500 for a state that should be unreachable. */
function invariantBreak(message: string): ErrorResult<InternalServerError> {
  return { success: false, error: new InternalServerError(message) };
}

/** ScopeTarget is the resolved resource a seam maps the principal onto. */
type ScopeTarget = { orgId: string } | { projectId: string };

/** ScopeResult is the mapped scope, or the typed error an unmappable principal raises. */
export type ScopeResult =
  | (Success & { scope: ApiAccessScope })
  | ErrorResult<ScopeError>;

/** ScopeError is any typed failure the mapper surfaces. */
type ScopeError = InternalServerError | ForbiddenError | LangfuseNotFoundError;

/** ApiKeyPrincipal is the api-key variant of `Principal` the mapper consumes. */
type ApiKeyPrincipal = Extract<Principal, { kind: "apiKey" }>;
