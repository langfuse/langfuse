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
    api.TableViewPresets.getByTableName.useQuery(
      {
        tableName,
        projectId,
      },
      // `projectId` comes from `router.query`, which Next.js populates only
      // after hydration; unguarded the query fires with `undefined` and the
      // rejected zod input surfaces as a "Bad Request" toast.
      { enabled: Boolean(projectId) },
    );

  return {
    TableViewPresetsList: TableViewPresets,
  };
};
