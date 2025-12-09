import type { DatasetItemDomain, Prisma } from "@langfuse/shared";
import { CodeMirrorEditor } from "@/src/components/editor";
import { DatasetSchemaHoverCard } from "./DatasetSchemaHoverCard";
import { useDatasetItemValidation } from "../hooks/useDatasetItemValidation";
import { DatasetItemFieldSchemaErrors } from "./DatasetItemFieldSchemaErrors";
import { useMemo } from "react";

type Dataset = {
  id: string;
  name: string;
  inputSchema: Prisma.JsonValue | null;
  expectedOutputSchema: Prisma.JsonValue | null;
};

type ViewDatasetItemProps = {
  datasetItem: DatasetItemDomain;
  dataset: Dataset | null;
};

export const ViewDatasetItem = ({
  datasetItem,
  dataset,
}: ViewDatasetItemProps) => {
  const inputValue = datasetItem.input
    ? JSON.stringify(datasetItem.input, null, 2)
    : "";
  const expectedOutputValue = datasetItem.expectedOutput
    ? JSON.stringify(datasetItem.expectedOutput, null, 2)
    : "";
  const metadataValue = datasetItem.metadata
    ? JSON.stringify(datasetItem.metadata, null, 2)
    : "";

  // Create dataset array for validation hook
  const datasets = useMemo(() => {
    if (!dataset) return [];
    return [dataset];
  }, [dataset]);

  // Validate against dataset schemas
  const validation = useDatasetItemValidation(
    inputValue,
    expectedOutputValue,
    datasets,
  );

  // Filter validation errors by field
  const inputErrors = validation.errors.filter((e) => e.field === "input");
  const expectedOutputErrors = validation.errors.filter(
    (e) => e.field === "expectedOutput",
  );

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Input</label>
            {dataset?.inputSchema && (
              <DatasetSchemaHoverCard
                schema={dataset.inputSchema}
                schemaType="input"
                showLabel
              />
            )}
          </div>
          <CodeMirrorEditor
            mode="json"
            value={inputValue}
            editable={false}
            minHeight={200}
          />
          {validation.hasSchemas && inputErrors.length > 0 && (
            <DatasetItemFieldSchemaErrors
              errors={inputErrors}
              showDatasetName={false}
            />
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Expected output</label>
            {dataset?.expectedOutputSchema && (
              <DatasetSchemaHoverCard
                schema={dataset.expectedOutputSchema}
                schemaType="expectedOutput"
                showLabel
              />
            )}
          </div>
          <CodeMirrorEditor
            mode="json"
            value={expectedOutputValue}
            editable={false}
            minHeight={200}
          />
          {validation.hasSchemas && expectedOutputErrors.length > 0 && (
            <DatasetItemFieldSchemaErrors
              errors={expectedOutputErrors}
              showDatasetName={false}
            />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Metadata</label>
        <CodeMirrorEditor
          mode="json"
          value={metadataValue}
          editable={false}
          minHeight={100}
        />
      </div>
    </div>
  );
};
