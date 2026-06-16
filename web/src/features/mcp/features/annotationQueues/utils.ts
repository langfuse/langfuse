import { getAnnotationQueueRecordOrThrow } from "@/src/features/annotation-queues/server/publicAnnotationQueueService";

export const verifyAnnotationQueue = async ({
  projectId,
  queueId,
}: {
  projectId: string;
  queueId: string;
}) => {
  return await getAnnotationQueueRecordOrThrow({ projectId, queueId });
};
