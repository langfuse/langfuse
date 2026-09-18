import {
  CommentObjectType,
  type CreateCommentData,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { type z } from "zod";
import {
  getObservationById,
  getObservationByIdFromEventsTable,
  getTraceById,
  getTracesIdentifierForSession,
} from "@langfuse/shared/src/server";

export const validateCommentReferenceObject = async ({
  ctx,
  input,
}: {
  ctx: any;
  input: z.infer<typeof CreateCommentData>;
}): Promise<{ errorMessage?: string }> => {
  const { objectId, objectType, projectId, objectStartTime } = input;

  let commentTarget;
  switch (objectType) {
    case CommentObjectType.OBSERVATION: {
      const getObservation = (
        params: Parameters<typeof getObservationByIdFromEventsTable>[0],
      ) =>
        ctx.session?.user?.v4BetaEnabled === true
          ? getObservationByIdFromEventsTable(params)
          : // eslint-disable-next-line @typescript-eslint/no-deprecated
            getObservationById(params);
      try {
        commentTarget = await getObservation({
          id: objectId,
          projectId,
          // objectStartTime is a performance hint: it bounds the lookup to its
          // minute so ClickHouse can prune parts/partitions. On a miss we retry
          // unbounded below, so a wrong or stale hint only ever costs speed,
          // never correctness.
          startTime: objectStartTime ?? undefined,
        });
      } catch (e) {
        if (!(e instanceof LangfuseNotFoundError) || !objectStartTime) throw e;
        commentTarget = await getObservation({ id: objectId, projectId });
      }
      break;
    }
    case CommentObjectType.TRACE: {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      commentTarget = await getTraceById({
        traceId: objectId,
        projectId,
      });
      break;
    }
    case CommentObjectType.SESSION: {
      commentTarget =
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        (await getTracesIdentifierForSession(projectId, objectId)).shift();
      break;
    }
    case CommentObjectType.PROMPT: {
      commentTarget = await ctx.prisma.prompt.findFirst({
        where: {
          id: objectId,
          projectId,
        },
      });
      break;
    }
    default: {
      const _exhaustiveCheck: never = objectType;
      throw new Error(`Invalid object type for comment: ${objectType}`);
    }
  }

  return Boolean(commentTarget)
    ? {}
    : {
        errorMessage: `Reference object, ${objectType}: ${objectId} not found. Skipping comment creation.`,
      };
};
