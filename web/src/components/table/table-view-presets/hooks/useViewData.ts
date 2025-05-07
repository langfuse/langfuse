import { api } from "@/src/utils/api";

type UseViewDataProps = {
  tableName: string;
  projectId: string;
};

export const useViewData = ({ tableName, projectId }: UseViewDataProps) => {
  const { data: TableViewPresets } =
    api.TableViewPresets.getByTableName.useQuery({
      tableName,
      projectId,
    });

  return {
    TableViewPresetsList: TableViewPresets,
  };
};
