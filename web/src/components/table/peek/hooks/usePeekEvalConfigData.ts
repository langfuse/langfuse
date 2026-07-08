import { api } from "@/src/utils/api";

type UsePeekEvalConfigDataProps = {
  projectId: string;
  jobConfigurationId?: string;
};

export const usePeekEvalConfigData = ({
  projectId,
  jobConfigurationId,
}: UsePeekEvalConfigDataProps) => {
  return api.evals.configById.useQuery(
    {
      id: jobConfigurationId as string,
      projectId,
    },
    {
      enabled: !!jobConfigurationId,
    },
  );
};
