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

    if (
      !env.LANGFUSE_AWS_BEDROCK_REGION ||
      !env.AWS_ACCESS_KEY_ID ||
      !env.AWS_SECRET_ACCESS_KEY
    ) {
      throw new BaseError(
        "PreconditionFailedError",
        412,
        "Assistant is not configured",
        true,
      );
    }

    const body = await request.json().catch(() => null);
    const parsedInput = AgUiRunAgentInputSchema.safeParse(body);

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
        awsCredentials: {
          region: env.LANGFUSE_AWS_BEDROCK_REGION,
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        },
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
