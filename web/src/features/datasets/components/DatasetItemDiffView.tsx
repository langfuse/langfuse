import type { DatasetItemDomain } from "@langfuse/shared";
import DiffViewer from "@/src/components/DiffViewer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import { stringifyDatasetItemData } from "../utils/datasetItemUtils";

type DatasetItemDiffViewProps = {
  selectedVersion: DatasetItemDomain;
  latestVersion: DatasetItemDomain;
};

export const DatasetItemDiffView = ({
  selectedVersion,
  latestVersion,
}: DatasetItemDiffViewProps) => {
  return (
    <div className="space-y-4">
      <Accordion
        type="multiple"
        defaultValue={["input", "output"]}
        className="w-full"
      >
        <AccordionItem value="input">
          <AccordionTrigger>Input</AccordionTrigger>
          <AccordionContent>
            <DiffViewer
              oldString={stringifyDatasetItemData(selectedVersion.input)}
              newString={stringifyDatasetItemData(latestVersion.input)}
              oldLabel="Selected Version"
              newLabel="Latest Version"
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="output">
          <AccordionTrigger>Expected Output</AccordionTrigger>
          <AccordionContent>
            <DiffViewer
              oldString={stringifyDatasetItemData(
                selectedVersion.expectedOutput,
              )}
              newString={stringifyDatasetItemData(latestVersion.expectedOutput)}
              oldLabel="Selected Version"
              newLabel="Latest Version"
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="metadata">
          <AccordionTrigger>Metadata</AccordionTrigger>
          <AccordionContent>
            <DiffViewer
              oldString={stringifyDatasetItemData(selectedVersion.metadata)}
              newString={stringifyDatasetItemData(latestVersion.metadata)}
              oldLabel="Selected Version"
              newLabel="Latest Version"
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
