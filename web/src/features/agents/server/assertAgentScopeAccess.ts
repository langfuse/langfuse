import { TRPCError } from "@trpc/server";
import { type Session } from "next-auth";
import { type AgentTraceScope } from "@langfuse/shared/agents";
import { env } from "@/src/env.mjs";
import { canViewAgents } from "../agentsAccess";

/** Standard table endpoints retain their existing access unless an Agents membership is requested. */
export function assertAgentScopeAccess({
  session,
  projectId,
  agentScope,
}: {
  session: Partial<Session> | null;
  projectId: string;
  agentScope?: AgentTraceScope;
}) {
  if (!agentScope) return;
  if (
    !session?.user ||
    !session.expires ||
    !session.environment ||
    env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "legacy"
  ) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Agents is not available.",
    });
  }
  const authenticatedSession: Session = {
    ...session,
    user: session.user,
    expires: session.expires,
    environment: session.environment,
  };
  if (!canViewAgents(authenticatedSession, projectId)) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Agents is not available.",
    });
  }
}
