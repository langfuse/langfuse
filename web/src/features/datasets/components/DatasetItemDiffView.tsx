import type { DatasetItemDomain } from "@langfuse/shared";
import DiffViewer from "@/src/components/DiffViewer";
import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
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
      <div className="w-full">
        <Accordion type="multiple" defaultValue={["input", "output"]}>
          <Accordion.Item value="input">
            <Accordion.Trigger>Input</Accordion.Trigger>
            <Accordion.Content>
              <div className="pb-4">
                <DiffViewer
                  oldString={stringifyDatasetItemData(selectedVersion.input)}
                  newString={stringifyDatasetItemData(latestVersion.input)}
                  oldLabel="Selected Version"
                  newLabel="Latest Version"
                />
              </div>
            </Accordion.Content>
          </Accordion.Item>

          <Accordion.Item value="output">
            <Accordion.Trigger>Expected Output</Accordion.Trigger>
            <Accordion.Content>
              <div className="pb-4">
                <DiffViewer
                  oldString={stringifyDatasetItemData(
                    selectedVersion.expectedOutput,
                  )}
                  newString={stringifyDatasetItemData(
                    latestVersion.expectedOutput,
                  )}
                  oldLabel="Selected Version"
                  newLabel="Latest Version"
                />
              </div>
            </Accordion.Content>
          </Accordion.Item>

          <Accordion.Item value="metadata">
            <Accordion.Trigger>Metadata</Accordion.Trigger>
            <Accordion.Content>
              <div className="pb-4">
                <DiffViewer
                  oldString={stringifyDatasetItemData(selectedVersion.metadata)}
                  newString={stringifyDatasetItemData(latestVersion.metadata)}
                  oldLabel="Selected Version"
                  newLabel="Latest Version"
                />
              </div>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion>
      </div>
    </div>
  );
};
