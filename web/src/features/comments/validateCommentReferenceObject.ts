import { CommentObjectType, type CreateCommentData } from "@langfuse/shared";
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
  const { objectId, objectType, projectId } = input;

  let commentTarget;
  switch (objectType) {
    case CommentObjectType.OBSERVATION: {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      commentTarget = await getObservationById({
        id: objectId,
        projectId,
      });
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
