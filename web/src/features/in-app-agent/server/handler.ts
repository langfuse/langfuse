import { getServerSession } from "next-auth";

import { env } from "@/src/env.mjs";
import {
  AgUiRunAgentInputSchema,
  type AgUiRunAgentInput,
  InAppAgentRuntimeStateSchema,
  type AgUiMessage,
} from "@/src/features/in-app-agent/schema";
import { createAgUiStream } from "@/src/features/in-app-agent/server/agent";
import {
  InvalidInAppAgentSessionTokenError,
  signInAppAgentSessionToken,
  verifyInAppAgentSessionToken,
} from "@/src/features/in-app-agent/server/auth";
import { getAuthOptions } from "@/src/server/auth";
import { isProjectMemberOrAdmin } from "@/src/server/utils/checkProjectMembershipOrAdmin";
import {
  BaseError,
  ForbiddenError,
  InvalidRequestError,
  UnauthorizedError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { assertUnreachable } from "@/src/utils/types";
import {
  createAndAddApiKeysToDb,
  deleteApiKeyFromDb,
} from "@langfuse/shared/src/server/auth/apiKeys";
import { logger } from "@langfuse/shared/src/server";

const IN_APP_AGENT_API_KEY_NOTE = "In-app agent MCP session";
const MAX_IN_APP_AGENT_INPUT_BYTES = 1024 * 1024;

export default async function handler(request: Request) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      throw new UnauthorizedError("Unauthenticated");
    }

    if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
      throw new BaseError(
        "PreconditionFailedError",
        412,
        "Assistant is not available in self-hosted deployments.",
        true,
      );
    }

    if (!env.LANGFUSE_AWS_BEDROCK_REGION) {
      throw new BaseError(
        "PreconditionFailedError",
        412,
        "Assistant is not configured",
        true,
      );
    }

    const bodyResult = await readBoundedJsonBody(
      request,
      MAX_IN_APP_AGENT_INPUT_BYTES,
    );

    if (!bodyResult.success) {
      if (bodyResult.error === "invalid_body") {
        throw new InvalidRequestError("Invalid input");
      }

      if (bodyResult.error === "payload_too_large") {
        throw new BaseError(
          "PayloadTooLargeError",
          413,
          "Input payload is too large",
          true,
        );
      }

      assertUnreachable(bodyResult.error);
    }

    const parsedInput = AgUiRunAgentInputSchema.safeParse(bodyResult.data);

    if (!parsedInput.success) {
      throw new InvalidRequestError("Invalid input");
    }

    const input = parsedInput.data;
    const parsedState = InAppAgentRuntimeStateSchema.safeParse(input.state);

    if (!parsedState.success) {
      throw new InvalidRequestError("Invalid agent state");
    }

    const auth = { userId: session.user.id, user: session.user };

    const { projectId, claudeSessionId } = (() => {
      if (parsedState.data.type === "newSession") {
        return {
          projectId: parsedState.data.projectId,
          claudeSessionId: undefined,
        };
      }

      return verifyInAppAgentSessionToken(parsedState.data.claudeSessionToken, {
        userId: auth.userId,
        threadId: input.threadId,
      });
    })();

    if (!isProjectMemberOrAdmin(auth.user, projectId)) {
      throw new ForbiddenError("User is not a member of this project");
    }

    // This condition should match `useIsFeatureEnabled("inAppAgent")` in the frontend
    const isInAppAgentEnabled =
      auth.user.featureFlags.inAppAgent === true ||
      auth.user.admin === true ||
      session.environment.enableExperimentalFeatures === true;

    if (!isInAppAgentEnabled) {
      throw new ForbiddenError("Assistant is not enabled for this user");
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        organization: {
          select: {
            aiFeaturesEnabled: true,
          },
        },
      },
    });

    if (!project?.organization.aiFeaturesEnabled) {
      throw new ForbiddenError(
        "Assistant is not enabled for this organization",
      );
    }

    const sanitizedInput = sanitizeAgentInput(input);
    const awsProfile = env.LANGFUSE_IN_APP_AGENT_AWS_PROFILE;
    return await withInAppAgentMcpApiKeyCleanup(
      projectId,
      (mcpApiKey, cleanupMcpApiKey) => {
        const stream = createAgUiStream({
          input: sanitizedInput,
          signal: request.signal,
          options: {
            resumeSessionId: claudeSessionId,
            createResumeStateForSessionId: (claudeSessionId) => ({
              type: "existingSession",
              claudeSessionToken: signInAppAgentSessionToken({
                userId: auth.userId,
                projectId,
                threadId: sanitizedInput.threadId,
                claudeSessionId,
              }),
            }),
            awsBedrock: {
              region: env.LANGFUSE_AWS_BEDROCK_REGION,
              ...(awsProfile ? { profile: awsProfile } : {}),
            },
            langfuseMcp: {
              url: getLangfuseMcpUrl(),
              publicKey: mcpApiKey.publicKey,
              secretKey: mcpApiKey.secretKey,
            },
            onFinish: cleanupMcpApiKey,
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Content-Encoding": "none",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    );
  } catch (err) {
    if (err instanceof BaseError) {
      return Response.json({ error: err.message }, { status: err.httpCode });
    }

    if (err instanceof InvalidInAppAgentSessionTokenError) {
      return Response.json(
        { error: err.message, code: "invalid_session_token" },
        { status: 400 },
      );
    }

    throw err;
  }
}

function getLangfuseMcpUrl(): string {
  const rawUrl = env.NEXTAUTH_URL.replace(/\/api\/auth\/?$/, "");
  const baseUrl = new URL(rawUrl);

  baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, "")}/api/public/mcp`;
  baseUrl.search = "";
  baseUrl.hash = "";

  return baseUrl.toString();
}

async function createInAppAgentMcpApiKey(projectId: string) {
  return createAndAddApiKeysToDb({
    prisma,
    entityId: projectId,
    scope: "PROJECT",
    note: IN_APP_AGENT_API_KEY_NOTE,
    isInAppAgentKey: true,
  });
}

async function withInAppAgentMcpApiKeyCleanup<T>(
  projectId: string,
  createResponse: (
    mcpApiKey: Awaited<ReturnType<typeof createInAppAgentMcpApiKey>>,
    cleanupMcpApiKey: () => Promise<void>,
  ) => T,
): Promise<T> {
  const mcpApiKey = await createInAppAgentMcpApiKey(projectId);
  let cleanupPromise: Promise<void> | undefined;

  const cleanupMcpApiKey = () => {
    if (!cleanupPromise) {
      cleanupPromise = cleanupInAppAgentMcpApiKey({
        apiKeyId: mcpApiKey.id,
        projectId,
      }).catch((cleanupErr) => {
        cleanupPromise = undefined;
        throw cleanupErr;
      });
    }

    return cleanupPromise;
  };

  try {
    return createResponse(mcpApiKey, cleanupMcpApiKey);
  } catch (err) {
    await cleanupMcpApiKey().catch((cleanupErr) => {
      logger.error("Failed to clean up in-app agent MCP API key", cleanupErr);
    });
    throw err;
  }
}

async function cleanupInAppAgentMcpApiKey(params: {
  apiKeyId: string;
  projectId: string;
}) {
  await deleteApiKeyFromDb({
    prisma,
    id: params.apiKeyId,
    entityId: params.projectId,
    scope: "PROJECT",
  });
}

function sanitizeAgentInput(input: AgUiRunAgentInput): AgUiRunAgentInput {
  const lastUserMessage = getLastUserMessage(input.messages);

  if (!lastUserMessage) {
    throw new InvalidRequestError("Input payload must include a user message");
  }

  return {
    threadId: input.threadId,
    runId: input.runId,
    ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
    state: null,
    messages: [lastUserMessage],
    tools: [],
    context: [],
    forwardedProps: {},
  };
}

function getLastUserMessage(
  messages: AgUiMessage[],
): Extract<AgUiMessage, { role: "user" }> | undefined {
  const lastMessage = messages.at(-1);

  if (lastMessage?.role !== "user") {
    return undefined;
  }

  const text =
    typeof lastMessage.content === "string"
      ? lastMessage.content
      : lastMessage.content
          .flatMap((part) => (part.type === "text" ? [part.text] : []))
          .join("");

  if (!text.trim()) {
    return undefined;
  }

  return {
    id: lastMessage.id,
    role: "user",
    content: text,
  };
}

type BoundedJsonBodyResult =
  | { success: true; data: unknown }
  | { success: false; error: "invalid_body" | "payload_too_large" };

async function readBoundedJsonBody(
  request: Request,
  maxSizeBytes: number,
): Promise<BoundedJsonBodyResult> {
  const contentLength = Number(request.headers.get("content-length"));

  if (Number.isFinite(contentLength) && contentLength > maxSizeBytes) {
    return { success: false, error: "payload_too_large" };
  }

  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  if (!reader) {
    return { success: false, error: "invalid_body" };
  }

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    receivedBytes += value.byteLength;

    if (receivedBytes > maxSizeBytes) {
      await reader.cancel().catch(() => undefined);
      return { success: false, error: "payload_too_large" };
    }

    chunks.push(value);
  }

  const bodyText = new TextDecoder().decode(Buffer.concat(chunks));

  try {
    return { success: true, data: bodyText ? JSON.parse(bodyText) : null };
  } catch {
    return { success: false, error: "invalid_body" };
  }
}
