import {
  CommentObjectType,
  type CreateCommentData,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { type z } from "zod";
import {
  getObservationById,
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
      try {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        commentTarget = await getObservationById({
          id: objectId,
          projectId,
          // Bounds the events_full lookup to the observation's day so ClickHouse
          // can prune partitions/parts; absent, the lookup falls back to a scan.
          startTime: objectStartTime ?? undefined,
        });
      } catch (e) {
        // objectStartTime is a client-supplied hint on the public API; a wrong
        // or stale value bounds the lookup to the wrong day, so getObservationById
        // throws NotFound for an observation that does exist. Retry once
        // unbounded so the hint can only ever speed up a hit, never turn into a
        // false "not found". A genuine miss re-throws from the unbounded lookup.
        if (!(e instanceof LangfuseNotFoundError) || !objectStartTime) throw e;
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        commentTarget = await getObservationById({ id: objectId, projectId });
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
