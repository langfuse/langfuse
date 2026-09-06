import { DatasetItemDiffView } from "./DatasetItemDiffView";
import type { DatasetItemDomain } from "@langfuse/shared";
import {
  stringifyDatasetItemData,
  type DatasetSchema,
} from "../utils/datasetItemUtils";
import { DatasetItemFields } from "@/src/features/datasets/components/DatasetItemFields";
import { useTranslations } from "next-intl";

type DatasetItemVersionedContentProps = {
  itemAtVersion: DatasetItemDomain | null;
  latestItem: DatasetItemDomain | null;
  isLoadingVersioned: boolean;
  isLoadingLatest: boolean;
  showDiffMode: boolean;
  itemChangedAtVersion: boolean;
  dataset: DatasetSchema | null;
};

/**
 * Renders a dataset item at a specific historical version.
 * Supports diff view comparison with the latest version.
 * Handles loading states and cases where item doesn't exist at that version.
 */
export const DatasetItemVersionedContent = ({
  itemAtVersion,
  latestItem,
  isLoadingVersioned,
  isLoadingLatest,
  showDiffMode,
  itemChangedAtVersion,
  dataset,
}: DatasetItemVersionedContentProps) => {
  const t = useTranslations("coreDetails.datasets.itemStates");
  const tMisc = useTranslations("coreDetails.datasets.misc");
  const serializationError = {
    title: tMisc("stringifyFailed"),
    description: tMisc("stringifyFailedDescription"),
  };
  // Loading states
  if (isLoadingVersioned) {
    return <div className="text-muted-foreground text-sm">{t("loading")}</div>;
  }

  // Item doesn't exist at this version
  if (itemAtVersion === null) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="text-muted-foreground">
          <p className="text-lg font-bold">{t("missingAtVersion")}</p>
          <p className="mt-2 text-sm">{t("missingAtVersionDescription")}</p>
        </div>
      </div>
    );
  }

  // Show diff mode if enabled and item changed at this version
  if (showDiffMode && itemChangedAtVersion) {
    if (isLoadingLatest) {
      return (
        <div className="text-muted-foreground text-sm">{t("loading")}</div>
      );
    }

    // Can't show diff if latest doesn't exist
    if (latestItem === null) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <div className="text-muted-foreground">
            <p className="text-lg font-bold">{t("cannotDiff")}</p>
            <p className="mt-2 text-sm">{t("cannotDiffDescription")}</p>
          </div>
        </div>
      );
    }

    return (
      <DatasetItemDiffView
        selectedVersion={itemAtVersion}
        latestVersion={latestItem}
      />
    );
  }

  // Show normal view of selected version
  return (
    <DatasetItemFields
      values={{
        input: stringifyDatasetItemData(
          itemAtVersion.input,
          serializationError,
        ),
        expectedOutput: stringifyDatasetItemData(
          itemAtVersion.expectedOutput,
          serializationError,
        ),
        metadata: stringifyDatasetItemData(
          itemAtVersion.metadata,
          serializationError,
        ),
      }}
      dataset={dataset}
      editable={false}
      projectId={itemAtVersion.projectId}
      datasetItemId={itemAtVersion.id}
      datasetItemValidFrom={itemAtVersion.validFrom}
    />
  );
};
