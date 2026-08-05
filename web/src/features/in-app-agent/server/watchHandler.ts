import { BaseError, ForbiddenError, UnauthorizedError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { addUserToSpan, logger } from "@langfuse/shared/src/server";
import type { InAppAgentWatchFrame } from "@langfuse/shared/in-app-agent";
import { assertConversationAccess } from "@langfuse/shared/in-app-agent/server/access";
import { watchConversationFrames } from "@langfuse/shared/in-app-agent/server/watch";
import { z } from "zod";

import { assertInAppAgentAvailable } from "@/src/features/in-app-agent/server/availability";
import { getServerAuthSessionForRequest } from "@/src/server/auth";
import { isProjectMemberOrAdmin } from "@/src/server/utils/checkProjectMembershipOrAdmin";

const WatchQuerySchema = z.object({
  projectId: z.string().min(1),
  conversationId: z.string().min(1),
  cursor: z.coerce.number().int().min(-1).default(-1),
});

export default async function watchHandler(request: Request) {
  try {
    const session = await getServerAuthSessionForRequest(request);

    if (!session?.user) {
      throw new UnauthorizedError("Unauthenticated");
    }

    const user = session.user;

    addUserToSpan({ userId: user.id, email: user.email ?? undefined });

    const url = new URL(request.url);
    const query = WatchQuerySchema.safeParse({
      projectId: url.searchParams.get("projectId"),
      conversationId: url.searchParams.get("conversationId"),
      cursor:
        url.searchParams.get("cursor") ??
        request.headers.get("last-event-id") ??
        -1,
    });

    if (!query.success) {
      return Response.json({ error: "Invalid watch query" }, { status: 400 });
    }

    const { projectId, conversationId, cursor } = query.data;

    if (!isProjectMemberOrAdmin(user, projectId)) {
      throw new ForbiddenError("User is not a member of this project");
    }

    await assertInAppAgentAvailable({ prisma, projectId, user });

    const conversation = await prisma.inAppAgentConversation.findUnique({
      where: { id_projectId: { id: conversationId, projectId } },
      select: { createdByUserId: true, deletedAt: true },
    });

    if (!conversation) {
      throw new BaseError("NotFoundError", 404, "Conversation not found", true);
    }

    assertConversationAccess({
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
  const id = frame.type === "event" ? `id: ${frame.sequenceNumber}\n` : "";

  return `${id}event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`;
}
