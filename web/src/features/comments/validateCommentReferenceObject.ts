import {
  CommentObjectType,
  type PrismaClient,
  type CreateCommentData,
} from "@langfuse/shared";
import { type z } from "zod";
import { getObservationById, getTraceById } from "@langfuse/shared/src/server";

type PrismaModelName = keyof Omit<
  PrismaClient,
  | "$connect"
  | "$disconnect"
  | "$on"
  | "$transaction"
  | "$use"
  | "$extends"
  | "$executeRaw"
  | "$executeRawUnsafe"
  | "$queryRaw"
  | "$queryRawUnsafe"
  | "$metrics"
  | symbol
>;

const COMMENT_OBJECT_TYPE_TO_PRISMA_MODEL: Record<
  CommentObjectType,
  PrismaModelName
> = {
  [CommentObjectType.TRACE]: "trace",
  [CommentObjectType.OBSERVATION]: "observation",
  [CommentObjectType.SESSION]: "traceSession",
  [CommentObjectType.PROMPT]: "prompt",
} as const;

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
      clickhouseObject = await getObservationById(objectId, projectId);
    } else {
      clickhouseObject = await getTraceById(objectId, projectId);
    }

    return !!clickhouseObject
      ? {}
      : {
          errorMessage: `Reference object, ${objectType}: ${objectId} not found in Clickhouse. Skipping creating comment.`,
        };
  } else {
    const prismaModel = COMMENT_OBJECT_TYPE_TO_PRISMA_MODEL[objectType];

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
