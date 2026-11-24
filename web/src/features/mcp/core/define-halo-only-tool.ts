import { ForbiddenError, UnauthorizedError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { OrganizationId, ProjectId } from "@langfuse/shared/rbac";
import type { z } from "zod";
import { getPoliciesForUser } from "@/src/features/auth/policy/contextResolver";
import { defineTool } from "./define-tool";
import { runMcpTool } from "./run-mcp-tool";
import type { ServerContext } from "../types";
import { authorize } from "@/src/features/rbac/authorize";

async function authorizeHaloOnlyTool(
  context: ServerContext,
  action: Parameters<typeof authorize>[2],
): Promise<void> {
  const auth = context.auth;
  const principal = auth?.principal;
  if (
    !auth ||
    principal?.kind !== "apiKey" ||
    principal.scope !== "PROJECT" ||
    principal.presentation !== "privateKey" ||
    principal.apiKeyId !== context.apiKeyId ||
    principal.boundResource.orgId !== context.orgId ||
    principal.boundResource.projectId !== context.projectId
  ) {
    throw new UnauthorizedError();
  }
  if (!principal.isInAppAgentKey || !principal.userId || !context.inAppAgent) {
    throw new ForbiddenError();
  }

  const org = OrganizationId(context.orgId);
  const project = ProjectId(context.projectId);
  const keyDecision = authorize(auth, org, action, project);
  if (!keyDecision.success) throw keyDecision.error;

  // Halo's project credential carries the legacy API-key role, not the user's
  // project role. Enforce the triggering user's current permissions separately.
  const userDecision = authorize(
    { policies: [await getPoliciesForUser(prisma, principal.userId)] },
    org,
    action,
    project,
  );
  if (!userDecision.success) throw userDecision.error;
}

export function defineHaloOnlyTool<TInput, const TName extends string>({
  name,
  action,
  description,
  baseSchema,
  inputSchema = baseSchema,
  destructiveHint,
  readOnlyHint = false,
  spanName,
  handler,
}: {
  name: TName;
  action: Parameters<typeof authorize>[2];
  description: string;
  baseSchema: z.ZodType<TInput>;
  inputSchema?: z.ZodType<TInput>;
  destructiveHint?: boolean;
  readOnlyHint?: boolean;
  spanName: string;
  handler: (input: TInput, context: ServerContext) => Promise<unknown>;
}) {
  return defineTool({
    name,
    action,
    description,
    baseSchema,
    inputSchema,
    readOnlyHint,
    destructiveHint,
    handler: (input, context) =>
      runMcpTool({
        spanName,
        context,
        fn: async () => {
          await authorizeHaloOnlyTool(context, action);
          return handler(input, context);
        },
      }),
  });
}
