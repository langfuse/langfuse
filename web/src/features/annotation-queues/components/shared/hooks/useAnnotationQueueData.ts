import { api } from "@/src/utils/api";

export interface AnnotationQueueDataConfig {
  annotationQueueId: string;
  projectId: string;
}

export const useAnnotationQueueData = (config: AnnotationQueueDataConfig) => {
  const queueData = api.annotationQueues.byId.useQuery(
    {
      queueId: config.annotationQueueId,
      projectId: config.projectId,
    },
    {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  return {
    queueData,
    configs: queueData.data?.scoreConfigs ?? [],
  };
};
