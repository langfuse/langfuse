import type { DatasetItemDomain } from "@langfuse/shared";
import {
  stringifyDatasetItemData,
  type DatasetSchema,
} from "../utils/datasetItemUtils";
import { DatasetItemFields } from "@/src/features/datasets/components/DatasetItemFields";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("coreDetails.datasets.itemStates");
  const tMisc = useTranslations("coreDetails.datasets.misc");
  const serializationError = {
    title: tMisc("stringifyFailed"),
    description: tMisc("stringifyFailedDescription"),
  };
  if (isLoading) {
    return <div className="text-muted-foreground text-sm">{t("loading")}</div>;
  }

  if (item === null) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="text-muted-foreground">
          <p className="text-lg font-bold">{t("notFound")}</p>
          <p className="mt-2 text-sm">{t("notFoundDescription")}</p>
        </div>
      </div>
    );
  }

  return (
    <DatasetItemFields
      values={{
        input: stringifyDatasetItemData(item.input, serializationError),
        expectedOutput: stringifyDatasetItemData(
          item.expectedOutput,
          serializationError,
        ),
        metadata: stringifyDatasetItemData(item.metadata, serializationError),
      }}
      dataset={dataset}
      editable={false}
      projectId={item.projectId}
      datasetItemId={item.id}
    />
  );
};
