import { getServerSession } from "next-auth";

import {
  BaseError,
  ForbiddenError,
  InvalidRequestError,
  UnauthorizedError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { addUserToSpan, logger } from "@langfuse/shared/src/server";
import type { InAppAgentWatchFrame } from "@langfuse/shared/in-app-agent";
import { assertConversationAccess } from "@langfuse/shared/in-app-agent/server/access";
import { watchConversationFrames } from "@langfuse/shared/in-app-agent/server/watch";

import { env } from "@/src/env.mjs";
import { hasEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { getAuthOptions } from "@/src/server/auth";
import { isProjectMemberOrAdmin } from "@/src/server/utils/checkProjectMembershipOrAdmin";

/**
 * Live tail of a conversation's persisted event stream.
 *
 * Scope is the conversation, not the run: one stream spans approval
 * continuations and supersedes, so the client never has to rediscover run IDs.
 * The cursor is the conversation-wide `sequenceNumber` that `getConversation`
 * already returns, which makes the hydration→tail handoff gap-free and
 * duplicate-free by construction.
 *
 * Drops are normal and the cursor makes them free. This endpoint therefore
 * ends every stream deliberately after `WATCH_MAX_CONNECTION` rather than
 * waiting to be cut off unpredictably by a route or load-balancer limit; the
 * client reconnects with its cursor through the exact same path as a fresh
 * page load. One code path for cold start, refresh and reconnect.
 */
export default async function watchHandler(request: Request) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      throw new UnauthorizedError("Unauthenticated");
    }

    const user = session.user;

    addUserToSpan({ userId: user.id, email: user.email ?? undefined });

    if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
      throw new BaseError(
        "PreconditionFailedError",
        412,
        "Assistant is not available in self-hosted deployments.",
        true,
      );
    }

    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    const conversationId = url.searchParams.get("conversationId");

    if (!projectId || !conversationId) {
      throw new InvalidRequestError(
        "projectId and conversationId are required",
      );
    }

    // Query param wins over Last-Event-ID: the cursor is a domain sequence the
    // hydration call also produces, not stream-private state. The header is
    // only the free fallback for browser-native reconnects.
    const cursor = parseCursor(
      url.searchParams.get("cursor") ?? request.headers.get("last-event-id"),
    );

    if (!isProjectMemberOrAdmin(user, projectId)) {
      throw new ForbiddenError("User is not a member of this project");
    }

    if (
      !hasEntitlement({
        entitlement: "in-app-agent",
        sessionUser: user,
        projectId,
      })
    ) {
      throw new ForbiddenError("Assistant is not enabled for this plan");
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { organization: { select: { aiFeaturesEnabled: true } } },
    });

    if (!project?.organization.aiFeaturesEnabled) {
      throw new ForbiddenError(
        "Assistant is not enabled for this organization",
      );
    }

    const conversation = await prisma.inAppAgentConversation.findUnique({
      where: { id_projectId: { id: conversationId, projectId } },
      select: { createdByUserId: true, deletedAt: true },
    });

    if (!conversation) {
      throw new BaseError("NotFoundError", 404, "Conversation not found", true);
    }

    assertConversationAccess({
      action: "watch",
      conversation,
      userId: user.id,
    });

    // Everything fallible is done; from here on the response is a stream and
    // failures can only be reported inside it.
    const stream = createWatchStream({
      projectId,
      conversationId,
      cursor,
      signal: request.signal,
    });

    return new Response(stream as unknown as BodyInit, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Content-Encoding": "none",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof BaseError) {
      return Response.json(
        { error: error.message },
        { status: error.httpCode },
      );
    }

    throw error;
  }
}

function parseCursor(raw: string | null): number {
  const parsed = Number(raw);

  // Sequence numbers start at 0, so -1 is "send me everything".
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
}

function createWatchStream(params: {
  projectId: string;
  conversationId: string;
  cursor: number;
  signal: AbortSignal;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const frames = watchConversationFrames({
        prisma,
        projectId: params.projectId,
        conversationId: params.conversationId,
        cursor: params.cursor,
        signal: params.signal,
      });

      try {
        for await (const frame of frames) {
          if (params.signal.aborted) {
            break;
          }

          controller.enqueue(
            encoder.encode(
              frame === null ? ": keepalive\n\n" : encodeFrame(frame),
            ),
          );
        }
      } catch (error) {
        logger.error("In-app agent watch stream failed", {
          error,
          projectId: params.projectId,
          conversationId: params.conversationId,
        });

        if (!params.signal.aborted) {
          controller.enqueue(
            encoder.encode(
              encodeFrame({
                type: "error",
                code: "watch_failed",
                message: "The connection to the run was interrupted.",
              }),
            ),
          );
        }
      } finally {
        await frames.return(undefined);
        controller.close();
      }
    },
  });
}

function encodeFrame(frame: InAppAgentWatchFrame): string {
  // The SSE id is the cursor, so Last-Event-ID works as a free fallback.
  const id = frame.type === "event" ? `id: ${frame.sequenceNumber}\n` : "";

  return `${id}event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`;
}
