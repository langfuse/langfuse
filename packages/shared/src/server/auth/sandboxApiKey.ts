import { randomUUID } from "crypto";

import { z } from "zod";

import { prisma, Prisma, Role } from "../../db";
import {
  projectRoleAccessRights,
  projectScopes,
  type ProjectScope,
} from "../../features/rbac/projectAccessRights";
import { logger } from "../logger";
import { redis } from "../redis/redis";
import { createAndAddApiKeysToDb, deleteApiKeyFromDb } from "./apiKeys";

/**
 * Public-key prefix for sandbox execution credentials.
 * Ordinary keys use `pk-lf-`. Auth uses this prefix to re-read the live grant
 * without an extra query on every other API key.
 */
export const SANDBOX_PUBLIC_KEY_PREFIX = "pk-lf-sb-";

const SANDBOX_API_KEY_NOTE = "Sandbox script execution";

/**
 * Credential administration is never placed on a guest-readable key, even
 * when the user's role includes it.
 */
const SANDBOX_DENIED_ACTIONS = new Set<ProjectScope>([
  "apiKeys:read",
  "apiKeys:CUD",
  "llmApiKeys:read",
  "llmApiKeys:create",
  "llmApiKeys:update",
  "llmApiKeys:delete",
  "project:update",
  "project:delete",
  "projectMembers:read",
  "projectMembers:CUD",
  "integrations:CRUD",
]);

/**
 * Public API action tokens that UI roles do not list. Each is available only
 * when the role already holds `requires`. This is the stand-in for a
 * first-class user-to-API-key permission map.
 */
const PUBLIC_API_ACTION_BRIDGES: ReadonlyArray<{
  action: ProjectScope;
  requires: ProjectScope;
}> = [
  { action: "traces:read", requires: "project:read" },
  { action: "traces:create", requires: "scores:CUD" },
  { action: "sessions:read", requires: "project:read" },
  { action: "metrics:read", requires: "project:read" },
  { action: "media:read", requires: "project:read" },
  { action: "media:create", requires: "scores:CUD" },
  { action: "models:read", requires: "project:read" },
  { action: "experiments:read", requires: "promptExperiments:read" },
  { action: "scores:read", requires: "project:read" },
  { action: "scores:create", requires: "scores:CUD" },
  { action: "feedback:create", requires: "scores:CUD" },
];

const projectScopeSet = new Set<string>(projectScopes);

const SandboxGrantSchema = z
  .object({
    actions: z.array(z.string()),
  })
  .strict();

export type SandboxCredentialEvaluation =
  | { kind: "allowed"; actions: ProjectScope[] }
  | { kind: "denied"; status: 401 | 403; message: string };

type SandboxAccess =
  | { admin: true }
  | {
      admin: false;
      role: Role;
    };

function isProjectScope(value: string): value is ProjectScope {
  return projectScopeSet.has(value);
}

/**
 * Actions the user may place on a sandbox key right now.
 * Instance admins use the owner ceiling. They do not bypass the denylist.
 */
export function sandboxActionsForAccess(
  access: SandboxAccess,
): Set<ProjectScope> {
  const roleScopes = access.admin
    ? projectRoleAccessRights.OWNER
    : projectRoleAccessRights[access.role];
  const actions = new Set<ProjectScope>(roleScopes);

  for (const bridge of PUBLIC_API_ACTION_BRIDGES) {
    if (access.admin || actions.has(bridge.requires)) {
      actions.add(bridge.action);
    }
  }

  for (const denied of SANDBOX_DENIED_ACTIONS) {
    actions.delete(denied);
  }

  return actions;
}

/**
 * Intersects an approval-time action list with the user's current ceiling.
 * Actions outside the ceiling are rejected so a grant cannot widen a role.
 */
export function clampApprovedSandboxActions(params: {
  ceiling: ReadonlySet<ProjectScope>;
  approvedActions: readonly string[];
}): ProjectScope[] {
  if (params.approvedActions.length === 0) {
    throw new Error("Sandbox execution requires at least one approved action");
  }

  const outside: string[] = [];
  const clamped: ProjectScope[] = [];
  const seen = new Set<ProjectScope>();

  for (const action of params.approvedActions) {
    if (!isProjectScope(action) || !params.ceiling.has(action)) {
      outside.push(action);
      continue;
    }
    if (seen.has(action)) continue;
    seen.add(action);
    clamped.push(action);
  }

  if (outside.length > 0) {
    throw new Error(
      `Approved actions exceed the user's current permissions: ${outside.join(", ")}`,
    );
  }

  return clamped;
}

async function resolveSandboxAccess(
  userId: string,
  projectId: string,
): Promise<SandboxAccess | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, admin: true },
  });
  if (!user) return null;
  if (user.admin) return { admin: true };

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { orgId: true },
  });
  if (!project) return null;

  const orgMembership = await prisma.organizationMembership.findUnique({
    where: { orgId_userId: { orgId: project.orgId, userId } },
    select: { role: true },
  });
  if (!orgMembership) return null;

  const projectMembership = await prisma.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  const role = projectMembership?.role ?? orgMembership.role;
  if (role === Role.NONE) return null;

  return { admin: false, role };
}

function isMissingApiKeyError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

/**
 * Deletes the sandbox key. A missing row is success.
 * Any other failure is thrown so the caller cannot treat the run as finished
 * while the credential is still valid.
 */
export async function revokeSandboxExecutionKey(params: {
  id: string;
  projectId: string;
}) {
  const existing = await prisma.apiKey.findFirst({
    where: {
      id: params.id,
      projectId: params.projectId,
      scope: "PROJECT",
    },
    select: { id: true },
  });
  if (!existing) return;

  try {
    await deleteApiKeyFromDb({
      prisma,
      id: params.id,
      entityId: params.projectId,
      scope: "PROJECT",
      redis,
    });
  } catch (error) {
    if (isMissingApiKeyError(error)) return;
    throw error;
  }
}

async function deleteSandboxKey(params: { id: string; projectId: string }) {
  try {
    await revokeSandboxExecutionKey(params);
  } catch (error) {
    logger.debug("Sandbox API key could not be deleted", {
      apiKeyId: params.id,
      projectId: params.projectId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function mintSandboxExecutionKey(params: {
  projectId: string;
  userId: string;
  approvedActions: readonly string[];
  expiresAt: Date;
}): Promise<{
  id: string;
  publicKey: string;
  secretKey: string;
  actions: ProjectScope[];
}> {
  const access = await resolveSandboxAccess(params.userId, params.projectId);
  if (!access) {
    throw new Error("User is not a member of this project");
  }

  const actions = clampApprovedSandboxActions({
    ceiling: sandboxActionsForAccess(access),
    approvedActions: params.approvedActions,
  });

  const key = await createAndAddApiKeysToDb({
    prisma,
    entityId: params.projectId,
    scope: "PROJECT",
    note: SANDBOX_API_KEY_NOTE,
    createdByUserId: params.userId,
    expiresAt: params.expiresAt,
    sandboxGrant: { actions },
    predefinedKeys: {
      publicKey: `${SANDBOX_PUBLIC_KEY_PREFIX}${randomUUID()}`,
      secretKey: `sk-lf-${randomUUID()}`,
    },
  });

  return {
    id: key.id,
    publicKey: key.publicKey,
    secretKey: key.secretKey,
    actions,
  };
}

/**
 * Re-reads the stored grant and the creator's current membership.
 * Expired keys, missing membership, and a missing creator are deleted here.
 * An action outside the current intersection is denied and the row is kept.
 */
export async function evaluateSandboxCredential(params: {
  apiKeyId: string;
  action: string | null;
}): Promise<SandboxCredentialEvaluation> {
  const row = await prisma.apiKey.findUnique({
    where: { id: params.apiKeyId },
    select: {
      id: true,
      projectId: true,
      publicKey: true,
      sandboxGrant: true,
      createdByUserId: true,
      expiresAt: true,
      scope: true,
    },
  });

  if (
    !row ||
    row.scope !== "PROJECT" ||
    row.projectId === null ||
    !row.publicKey.startsWith(SANDBOX_PUBLIC_KEY_PREFIX)
  ) {
    return {
      kind: "denied",
      status: 401,
      message: "Sandbox credential is not valid",
    };
  }

  const projectId = row.projectId;

  const denyAndDelete = async (
    status: 401 | 403,
    message: string,
  ): Promise<SandboxCredentialEvaluation> => {
    await deleteSandboxKey({ id: row.id, projectId });
    return { kind: "denied", status, message };
  };

  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    return denyAndDelete(401, "Sandbox credential has expired");
  }

  const parsedGrant = SandboxGrantSchema.safeParse(row.sandboxGrant);
  if (!parsedGrant.success || !row.createdByUserId) {
    return denyAndDelete(401, "Sandbox credential is not valid");
  }

  const access = await resolveSandboxAccess(row.createdByUserId, projectId);
  if (!access) {
    return denyAndDelete(
      401,
      "Sandbox credential owner is no longer a member of this project",
    );
  }

  const ceiling = sandboxActionsForAccess(access);
  const actions = parsedGrant.data.actions.filter(
    (action): action is ProjectScope =>
      isProjectScope(action) && ceiling.has(action),
  );

  if (
    params.action !== null &&
    !actions.includes(params.action as ProjectScope)
  ) {
    return {
      kind: "denied",
      status: 403,
      message: "Sandbox credential is not allowed to perform this action",
    };
  }

  return { kind: "allowed", actions };
}

/** Process environment for a sandbox guest. Values are not interpolated into the command string. */
export function sandboxProcessEnv(params: {
  publicKey: string;
  secretKey: string;
  langfuseOrigin: string;
}): Record<string, string> {
  const origin = params.langfuseOrigin.replace(/\/$/, "");
  return {
    LANGFUSE_PUBLIC_KEY: params.publicKey,
    LANGFUSE_SECRET_KEY: params.secretKey,
    LANGFUSE_HOST: origin,
    LANGFUSE_BASE_URL: origin,
    LANGFUSE_SANDBOX_MODEL_URL: `${origin}/api/internal/sandbox/llm-completion`,
  };
}
