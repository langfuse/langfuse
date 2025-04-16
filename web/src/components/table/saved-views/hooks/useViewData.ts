import { api } from "@/src/utils/api";

type UseViewDataProps = {
  tableName: string;
  projectId: string;
};

export const useViewData = ({ tableName, projectId }: UseViewDataProps) => {
  const { data: savedViews } = api.savedViews.getByTableName.useQuery({
    tableName,
    projectId,
  });

  return {
    savedViewList: savedViews,
  };
};
