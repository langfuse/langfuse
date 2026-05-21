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
  verifyInAppAgentSessionToken,
} from "@/src/features/in-app-agent/server/auth";
import {
  appendConversationMessage,
  createRun,
  ensureOwnedConversation,
  finishRun,
  updateProviderSessionId,
} from "@/src/features/in-app-agent/server/persistence";
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
import { TRPCError } from "@trpc/server";

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

    const {
      projectId,
      claudeSessionId: tokenClaudeSessionId,
      conversationId,
    } = (() => {
      if (parsedState.data.type === "newSession") {
        return {
          projectId: parsedState.data.projectId,
          conversationId: input.threadId,
          claudeSessionId: undefined,
        };
      }

      if (parsedState.data.type === "existingConversation") {
        if (parsedState.data.conversationId !== input.threadId) {
          throw new InvalidRequestError(
            "Conversation id does not match thread",
          );
        }

        return {
          projectId: parsedState.data.projectId,
          conversationId: parsedState.data.conversationId,
          claudeSessionId: undefined,
        };
      }

      const token = verifyInAppAgentSessionToken(
        parsedState.data.claudeSessionToken,
        {
          userId: auth.userId,
          threadId: input.threadId,
        },
      );

      return {
        projectId: token.projectId,
        conversationId: input.threadId,
        claudeSessionId: token.claudeSessionId,
      };
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

    const conversation = await ensureOwnedConversation({
      prisma,
      projectId,
      conversationId,
      userId: auth.userId,
    });

    await createRun({
      prisma,
      runId: sanitizedInput.runId,
      projectId,
      conversationId: conversation.id,
      userId: auth.userId,
      model: "haiku",
    });

    let stream: ReadableStream<Uint8Array>;

    try {
      await appendConversationMessage({
        prisma,
        projectId,
        conversationId: conversation.id,
        userId: auth.userId,
        message: sanitizedInput.messages[0]!,
        runId: sanitizedInput.runId,
      });

      const resumeSessionId =
        tokenClaudeSessionId ?? conversation.providerSessionId ?? undefined;

      stream = createAgUiStream({
        input: sanitizedInput,
        signal: request.signal,
        options: {
          resumeSessionId,
          createResumeStateForSessionId: (_claudeSessionId) => ({
            type: "existingConversation",
            projectId,
            conversationId: conversation.id,
          }),
          onResumeSessionId: (claudeSessionId) => {
            void updateProviderSessionId({
              prisma,
              projectId,
              conversationId: conversation.id,
              providerSessionId: claudeSessionId,
            }).catch((error) =>
              console.error("Failed to persist agent session id", error),
            );
          },
          onComplete: () => {
            void finishRun({
              prisma,
              runId: sanitizedInput.runId,
              projectId,
            });
          },
          onAbort: () => {
            void finishRun({
              prisma,
              runId: sanitizedInput.runId,
              projectId,
              errorCode: "cancelled",
              errorMessage: "Client aborted request",
            });
          },
          onError: (error) => {
            void finishRun({
              prisma,
              runId: sanitizedInput.runId,
              projectId,
              errorCode: "agent_error",
              errorMessage:
                error instanceof Error ? error.message : "Unknown agent error",
            });
          },
          awsBedrock: {
            region: env.LANGFUSE_AWS_BEDROCK_REGION,
            ...(awsProfile ? { profile: awsProfile } : {}),
          },
        },
      });
    } catch (error) {
      await finishRun({
        prisma,
        runId: sanitizedInput.runId,
        projectId,
        errorCode: "init_failed",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Agent initialization failed",
      });

      throw error;
    }

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Content-Encoding": "none",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
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

    if (err instanceof TRPCError) {
      return Response.json(
        { error: err.message },
        { status: getStatusCodeForTrpcError(err) },
      );
    }

    throw err;
  }
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

type SanitizedUserMessage = {
  id: string;
  role: "user";
  content: string;
};

function getLastUserMessage(
  messages: AgUiMessage[],
): SanitizedUserMessage | undefined {
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

function getStatusCodeForTrpcError(error: TRPCError): number {
  switch (error.code) {
    case "BAD_REQUEST":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    default:
      return 500;
  }
}
