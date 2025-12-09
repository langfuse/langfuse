import type { DatasetItemDomain } from "@langfuse/shared";
import DiffViewer from "@/src/components/DiffViewer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import { Badge } from "@/src/components/ui/badge";
import { useMemo } from "react";

type DatasetItemDiffViewProps = {
  selectedVersion: DatasetItemDomain;
  latestVersion: DatasetItemDomain;
};

const hasChanges = (oldValue: unknown, newValue: unknown): boolean => {
  const oldStr = JSON.stringify(oldValue, null, 2);
  const newStr = JSON.stringify(newValue, null, 2);
  return oldStr !== newStr;
};

export const DatasetItemDiffView = ({
  selectedVersion,
  latestVersion,
}: DatasetItemDiffViewProps) => {
  const inputChanged = hasChanges(selectedVersion.input, latestVersion.input);
  const outputChanged = hasChanges(
    selectedVersion.expectedOutput,
    latestVersion.expectedOutput,
  );
  const metadataChanged = hasChanges(
    selectedVersion.metadata,
    latestVersion.metadata,
  );

  // Auto-expand sections that have changes
  const defaultExpanded = useMemo(() => {
    const expanded: string[] = [];
    if (inputChanged) expanded.push("input");
    if (outputChanged) expanded.push("output");
    if (metadataChanged) expanded.push("metadata");
    // If nothing changed, expand all to show they're the same
    if (expanded.length === 0) {
      return ["input", "output", "metadata"];
    }
    return expanded;
  }, [inputChanged, outputChanged, metadataChanged]);

  return (
    <div className="space-y-4">
      <Accordion
        type="multiple"
        defaultValue={defaultExpanded}
        className="w-full"
      >
        <AccordionItem value="input">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <span>Input</span>
              {inputChanged && (
                <Badge variant="outline" className="text-xs">
                  Changed
                </Badge>
              )}
            </div>
          </AccordionTrigger>
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
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <span>Expected Output</span>
              {outputChanged && (
                <Badge variant="outline" className="text-xs">
                  Changed
                </Badge>
              )}
            </div>
          </AccordionTrigger>
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
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <span>Metadata</span>
              {metadataChanged && (
                <Badge variant="outline" className="text-xs">
                  Changed
                </Badge>
              )}
            </div>
          </AccordionTrigger>
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
