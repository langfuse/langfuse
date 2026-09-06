import type { DatasetItemDomain } from "@langfuse/shared";
import DiffViewer from "@/src/components/DiffViewer";
import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { stringifyDatasetItemData } from "../utils/datasetItemUtils";
import { useTranslations } from "next-intl";

type DatasetItemDiffViewProps = {
  selectedVersion: DatasetItemDomain;
  latestVersion: DatasetItemDomain;
};

export const DatasetItemDiffView = ({
  selectedVersion,
  latestVersion,
}: DatasetItemDiffViewProps) => {
  const t = useTranslations("coreDetails.datasets.diff");
  const tMisc = useTranslations("coreDetails.datasets.misc");
  const serializationError = {
    title: tMisc("stringifyFailed"),
    description: tMisc("stringifyFailedDescription"),
  };
  return (
    <div className="space-y-4">
      <div className="w-full">
        <Accordion type="multiple" defaultValue={["input", "output"]}>
          <Accordion.Item value="input">
            <Accordion.Trigger>{t("input")}</Accordion.Trigger>
            <Accordion.Content>
              <div className="pb-4">
                <DiffViewer
                  oldString={stringifyDatasetItemData(
                    selectedVersion.input,
                    serializationError,
                  )}
                  newString={stringifyDatasetItemData(
                    latestVersion.input,
                    serializationError,
                  )}
                  oldLabel={t("selectedVersion")}
                  newLabel={t("latestVersion")}
                />
              </div>
            </Accordion.Content>
          </Accordion.Item>

          <Accordion.Item value="output">
            <Accordion.Trigger>{t("expectedOutput")}</Accordion.Trigger>
            <Accordion.Content>
              <div className="pb-4">
                <DiffViewer
                  oldString={stringifyDatasetItemData(
                    selectedVersion.expectedOutput,
                    serializationError,
                  )}
                  newString={stringifyDatasetItemData(
                    latestVersion.expectedOutput,
                    serializationError,
                  )}
                  oldLabel={t("selectedVersion")}
                  newLabel={t("latestVersion")}
                />
              </div>
            </Accordion.Content>
          </Accordion.Item>

          <Accordion.Item value="metadata">
            <Accordion.Trigger>{t("metadata")}</Accordion.Trigger>
            <Accordion.Content>
              <div className="pb-4">
                <DiffViewer
                  oldString={stringifyDatasetItemData(
                    selectedVersion.metadata,
                    serializationError,
                  )}
                  newString={stringifyDatasetItemData(
                    latestVersion.metadata,
                    serializationError,
                  )}
                  oldLabel={t("selectedVersion")}
                  newLabel={t("latestVersion")}
                />
              </div>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion>
      </div>
    </div>
  );
};
