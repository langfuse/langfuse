import type { DatasetItemDomain } from "@langfuse/shared";
import DiffViewer from "@/src/components/DiffViewer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";

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
              oldString={
                selectedVersion.input
                  ? JSON.stringify(selectedVersion.input, null, 2)
                  : ""
              }
              newString={
                latestVersion.input
                  ? JSON.stringify(latestVersion.input, null, 2)
                  : ""
              }
              oldLabel="Selected Version"
              newLabel="Latest Version"
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="output">
          <AccordionTrigger>Expected Output</AccordionTrigger>
          <AccordionContent>
            <DiffViewer
              oldString={
                selectedVersion.expectedOutput
                  ? JSON.stringify(selectedVersion.expectedOutput, null, 2)
                  : ""
              }
              newString={
                latestVersion.expectedOutput
                  ? JSON.stringify(latestVersion.expectedOutput, null, 2)
                  : ""
              }
              oldLabel="Selected Version"
              newLabel="Latest Version"
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="metadata">
          <AccordionTrigger>Metadata</AccordionTrigger>
          <AccordionContent>
            <DiffViewer
              oldString={
                selectedVersion.metadata
                  ? JSON.stringify(selectedVersion.metadata, null, 2)
                  : ""
              }
              newString={
                latestVersion.metadata
                  ? JSON.stringify(latestVersion.metadata, null, 2)
                  : ""
              }
              oldLabel="Selected Version"
              newLabel="Latest Version"
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
