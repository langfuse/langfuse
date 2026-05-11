import { api } from "@/src/utils/api";
import { type TableViewPresetTableName } from "@langfuse/shared";

export const useViewData = ({
  tableName,
  projectId,
}: {
  tableName: TableViewPresetTableName;
  projectId: string;
}) => {
  const { data: TableViewPresets } =
    api.TableViewPresets.getByTableName.useQuery({
      tableName,
      projectId,
    });

  return {
    TableViewPresetsList: TableViewPresets,
  };
};
