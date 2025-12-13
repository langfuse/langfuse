import type { DatasetItemDomain } from "@langfuse/shared";
import { DatasetItemFields } from "./DatasetItemFields";
import {
  stringifyDatasetItemData,
  type DatasetSchema,
} from "../utils/datasetItemUtils";

type ViewDatasetItemProps = {
  datasetItem: DatasetItemDomain;
  dataset: DatasetSchema | null;
};

export const ViewDatasetItem = ({
  datasetItem,
  dataset,
}: ViewDatasetItemProps) => {
  return (
    <DatasetItemFields
      inputValue={stringifyDatasetItemData(datasetItem.input)}
      expectedOutputValue={stringifyDatasetItemData(datasetItem.expectedOutput)}
      metadataValue={stringifyDatasetItemData(datasetItem.metadata)}
      dataset={dataset}
      editable={false}
    />
  );
};
