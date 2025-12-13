import { ViewDatasetItem } from "./ViewDatasetItem";
import type { DatasetItemDomain } from "@langfuse/shared";
import type { DatasetSchema } from "../utils/datasetItemUtils";

type DatasetItemViewModeContentProps = {
  item: DatasetItemDomain | null;
  isLoading: boolean;
  dataset: DatasetSchema | null;
};

/**
 * Renders the latest version of a dataset item in view mode.
 * Handles loading and not-found states.
 */
export const DatasetItemViewModeContent = ({
  item,
  isLoading,
  dataset,
}: DatasetItemViewModeContentProps) => {
  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  if (item === null) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="text-muted-foreground">
          <p className="text-lg font-medium">Dataset item not found</p>
          <p className="mt-2 text-sm">
            This dataset item does not exist or has been deleted.
          </p>
        </div>
      </div>
    );
  }

  return <ViewDatasetItem datasetItem={item} dataset={dataset} />;
};
