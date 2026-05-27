import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

export const verifyAnnotationQueue = async ({
  projectId,
  queueId,
}: {
  projectId: string;
  queueId: string;
}) => {
  const queue = await prisma.annotationQueue.findUnique({
    where: {
      id: queueId,
      projectId,
    },
  });

  if (!queue) {
    throw new LangfuseNotFoundError("Annotation queue not found");
  }

  return queue;
};
