import { CommentObjectType, type CreateCommentData } from "@langfuse/shared";
import { type z } from "zod/v4";
import { getObservationById, getTraceById } from "@langfuse/shared/src/server";

const isObservationOrTrace = (objectType: CommentObjectType) => {
  return (
    objectType === CommentObjectType.OBSERVATION ||
    objectType === CommentObjectType.TRACE
  );
};

export const validateCommentReferenceObject = async ({
  ctx,
  input,
}: {
  ctx: any;
  input: z.infer<typeof CreateCommentData>;
}): Promise<{ errorMessage?: string }> => {
  const { objectId, objectType, projectId } = input;

  if (isObservationOrTrace(objectType)) {
    let clickhouseObject;
    if (objectType === CommentObjectType.OBSERVATION) {
      clickhouseObject = await getObservationById({
        id: objectId,
        projectId,
      });
    } else {
      clickhouseObject = await getTraceById({
        traceId: objectId,
        projectId,
      });
    }

    return !!clickhouseObject
      ? {}
      : {
          errorMessage: `Reference object, ${objectType}: ${objectId} not found in Clickhouse. Skipping creating comment.`,
        };
  } else {
    const prismaModel =
      objectType === CommentObjectType.SESSION
        ? "traceSession"
        : objectType === CommentObjectType.PROMPT
          ? "prompt"
          : null;

    if (!prismaModel) {
      return {
        errorMessage: `No prisma model for object type ${objectType}`,
      };
    }

    const model = ctx.prisma[prismaModel];
    const object = await model.findFirst({
      where: {
        id: objectId,
        projectId,
      },
    });

    if (!object) {
      return {
        errorMessage: `No ${prismaModel} with id ${objectId} in project ${projectId}`,
      };
    }
    return {};
  }
};
