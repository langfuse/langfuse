import { api } from "@/src/utils/api";
import { ConnectedIOTableCell } from "@/src/components/table/ConnectedIOTableCell";
import { useBoundRowHeightIO } from "@/src/components/table/data-table-row-height-switch";

const DATASET_IO_CELL_STALE_MS = 60 * 1000;

export const DatasetItemIOCell = ({
  projectId,
  datasetId,
  datasetItemId,
  io,
  datasetItemVersion,
  singleLine = false,
}: {
  projectId: string;
  datasetId: string;
  datasetItemId: string;
  io: "expectedOutput" | "input";
  datasetItemVersion?: Date;
  singleLine?: boolean;
}) => {
  const bound = useBoundRowHeightIO(true, singleLine, false);
  const datasetItem = api.datasets.itemById.useQuery(
    {
      projectId: projectId,
      datasetId: datasetId,
      datasetItemId: datasetItemId,
      version: datasetItemVersion,
    },
    { staleTime: DATASET_IO_CELL_STALE_MS },
  );

  if (datasetItem.isLoading) {
    return <ConnectedIOTableCell isLoading singleLine={bound.singleLine} />;
  }

  return (
    <ConnectedIOTableCell
      data={
        io === "expectedOutput"
          ? datasetItem.data?.expectedOutput
          : datasetItem.data?.input
      }
      singleLine={bound.singleLine}
    />
  );
};
