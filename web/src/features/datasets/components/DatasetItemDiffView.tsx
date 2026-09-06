import type { DatasetItemDomain } from "@langfuse/shared";
import DiffViewer from "@/src/components/DiffViewer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
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
      <Accordion
        type="multiple"
        defaultValue={["input", "output"]}
        className="w-full"
      >
        <AccordionItem value="input">
          <AccordionTrigger>{t("input")}</AccordionTrigger>
          <AccordionContent>
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
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="output">
          <AccordionTrigger>{t("expectedOutput")}</AccordionTrigger>
          <AccordionContent>
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
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="metadata">
          <AccordionTrigger>{t("metadata")}</AccordionTrigger>
          <AccordionContent>
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
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
