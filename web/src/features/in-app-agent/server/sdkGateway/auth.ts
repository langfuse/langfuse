import { prisma, type Role } from "@langfuse/shared/src/db";
import {
  digestExecutionToken,
  InAppAgentScriptExecutionLimitsSchema,
  isTerminalScriptExecutionState,
  parseExecutionPublicKey,
  type InAppAgentScriptExecutionLimits,
} from "@langfuse/shared/in-app-agent";
import { resolveInAppAgentUserProjectAccess } from "@langfuse/shared/in-app-agent/server/userProjectAccess";
import { tokensEqual } from "@langfuse/shared/in-app-agent/server/scriptExecution";

export type AuthenticatedSdkGatewayExecution = {
  executionId: string;
  projectId: string;
  conversationId: string;
  userId: string;
  projectRole: Role;
  isAdmin: boolean;
  limits: InAppAgentScriptExecutionLimits;
};

export function parseBasicAuthHeader(
  header: string | undefined,
): { publicKey: string; secret: string } | undefined {
  if (!header?.startsWith("Basic ")) {
    return undefined;
  }

  try {
    const decoded = Buffer.from(
      header.slice("Basic ".length),
      "base64",
    ).toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator <= 0) {
      return undefined;
    }

    return {
      publicKey: decoded.slice(0, separator),
      secret: decoded.slice(separator + 1),
    };
  } catch {
    return undefined;
  }
}

export async function authenticateSdkGatewayRequest(params: {
  authorization: string | undefined;
}): Promise<AuthenticatedSdkGatewayExecution | undefined> {
  const parsed = parseBasicAuthHeader(params.authorization);
  if (!parsed) {
    return undefined;
  }

  const credentialId = parseExecutionPublicKey(parsed.publicKey);
  if (!credentialId) {
    return undefined;
  }

  const execution = await prisma.inAppAgentScriptExecution.findUnique({
    where: { credentialId },
    omit: { tokenDigest: false },
  });

  if (
    !execution ||
    execution.tokenRevokedAt ||
    isTerminalScriptExecutionState(execution.state) ||
    execution.deadlineAt.getTime() <= Date.now()
  ) {
    return undefined;
  }

  if (
    !tokensEqual(execution.tokenDigest, digestExecutionToken(parsed.secret))
  ) {
    return undefined;
  }

  const access = await resolveInAppAgentUserProjectAccess({
    prisma,
    userId: execution.userId,
    projectId: execution.projectId,
  });

  if (!access) {
    return undefined;
  }

  return {
    executionId: execution.id,
    projectId: execution.projectId,
    conversationId: execution.conversationId,
    userId: execution.userId,
    projectRole: access.projectRole,
    isAdmin: access.isAdmin,
    limits: InAppAgentScriptExecutionLimitsSchema.parse(execution.limits),
  };
}
