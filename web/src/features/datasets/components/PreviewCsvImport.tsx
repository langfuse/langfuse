import { CsvColumnsCard } from "./CsvColumnsCard";
import { MappingCard } from "./MappingCard";
import {
  DndContext,
  closestCenter,
  MeasuringStrategy,
  DragOverlay,
} from "@dnd-kit/core";
import { useState, useEffect } from "react";
import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { Progress } from "@/src/components/ui/progress";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { DialogBody, DialogFooter } from "@/src/components/ui/dialog";
import { CsvImportValidationError } from "./CsvImportValidationError";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Label } from "@/src/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { InfoIcon, GripVertical } from "lucide-react";
import { useCsvMapping } from "@/src/features/datasets/hooks/useCsvMapping";
import { useCsvDragAndDrop } from "@/src/features/datasets/hooks/useCsvDragAndDrop";
import { useCsvImport } from "@/src/features/datasets/hooks/useCsvImport";
import { createPortal } from "react-dom";
import type { CsvPreviewResult } from "@/src/features/datasets/lib/csv/types";

// Helper to extract schema keys from object schema
function extractSchemaKeys(schema: unknown): string[] | null {
  if (!schema || typeof schema !== "object") return null;
  const schemaObj = schema as Record<string, unknown>;
  if (schemaObj.type !== "object" || !schemaObj.properties) return null;
  return Object.keys(schemaObj.properties as Record<string, unknown>);
}

export function PreviewCsvImport({
  preview,
  csvFile,
  projectId,
  datasetId,
  setCsvFile,
  setPreview,
  setOpen,
}: {
  preview: CsvPreviewResult;
  csvFile: File | null;
  projectId: string;
  datasetId: string;
  setCsvFile: (file: File | null) => void;
  setPreview: (preview: CsvPreviewResult | null) => void;
  setOpen?: (open: boolean) => void;
}) {
  const capture = usePostHogClientCapture();

  // Fetch dataset schema
  const { data: dataset } = api.datasets.byId.useQuery({
    projectId,
    datasetId,
  });

  // Parse schemas
  const inputSchemaKeys = extractSchemaKeys(dataset?.inputSchema);
  const expectedOutputSchemaKeys = extractSchemaKeys(
    dataset?.expectedOutputSchema,
  );

  // Toggle states for direct mapping mode (per field)
  const [useDirectMappingForInput, setUseDirectMappingForInput] =
    useState(false);
  const [
    useDirectMappingForExpectedOutput,
    setUseDirectMappingForExpectedOutput,
  ] = useState(false);

  // Compute effective schema keys - pass undefined when in direct mapping mode
  const effectiveInputSchemaKeys = useDirectMappingForInput
    ? undefined
    : (inputSchemaKeys ?? undefined);
  const effectiveExpectedOutputSchemaKeys = useDirectMappingForExpectedOutput
    ? undefined
    : (expectedOutputSchemaKeys ?? undefined);

  // Mapping state
  const mapping = useCsvMapping({
    preview,
    inputSchemaKeys: effectiveInputSchemaKeys,
    expectedOutputSchemaKeys: effectiveExpectedOutputSchemaKeys,
  });

  // Reset mappings when switching modes (avoids stale closure in callback)
  useEffect(() => {
    mapping.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useDirectMappingForInput, useDirectMappingForExpectedOutput]);

  // Drag and drop
  const dragAndDrop = useCsvDragAndDrop({
    handlers: {
      onAddToInputColumn: (columnName) => {
        const column = preview.columns.find((c) => c.name === columnName);
        if (column) mapping.addColumnToInput(column);
      },
      onAddToExpectedColumn: (columnName) => {
        const column = preview.columns.find((c) => c.name === columnName);
        if (column) mapping.addColumnToExpectedOutput(column);
      },
      onAddToMetadataColumn: (columnName) => {
        const column = preview.columns.find((c) => c.name === columnName);
        if (column) mapping.addColumnToMetadata(column);
      },
      onAddToInputSchemaKey: (schemaKey, column) => {
        mapping.addColumnToInput(column, schemaKey);
      },
      onAddToExpectedSchemaKey: (schemaKey, column) => {
        mapping.addColumnToExpectedOutput(column, schemaKey);
      },
      onRemoveFromAllMappings: mapping.removeColumnFromAll,
    },
  });

  // Import execution
  const csvImport = useCsvImport({
    projectId,
    datasetId,
    csvFile,
    input: mapping.input,
    expectedOutput: mapping.expectedOutput,
    metadata: mapping.metadata,
  });

  // Wrapping checkbox (only shown in freeform mode)
  const [wrapSingleColumn, setWrapSingleColumn] = useState(false);

  const handleImport = async () => {
    capture("dataset_item:upload_csv_form_submit");
    const success = await csvImport.execute(wrapSingleColumn);

    if (success) {
      setOpen?.(false);
      setPreview(null);
    }
  };

  const handleCancel = () => {
    setPreview(null);
    mapping.reset();
    setCsvFile(null);
    csvImport.reset();
  };

  const isSchemaMode =
    mapping.input.type === "schema" || mapping.expectedOutput.type === "schema";

  return (
    <>
      <DialogBody className="border-t">
        <div className="flex min-h-0 w-full flex-1 flex-col gap-3 px-2 py-1">
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={dragAndDrop.handleDragEnd}
            onDragStart={dragAndDrop.handleDragStart}
            measuring={{
              droppable: {
                strategy: MeasuringStrategy.Always,
              },
            }}
          >
            <div className="grid min-h-0 flex-1 grid-cols-[1fr,2fr] gap-4">
              <CsvColumnsCard
                columns={preview.columns}
                columnCount={preview.totalColumns}
              />
              <MappingCard
                input={mapping.input}
                expectedOutput={mapping.expectedOutput}
                metadata={mapping.metadata}
                onRemoveInputColumn={mapping.removeColumnFromInput}
                onRemoveExpectedColumn={mapping.removeColumnFromExpectedOutput}
                onRemoveMetadataColumn={mapping.removeColumnFromMetadata}
                inputSchemaKeys={inputSchemaKeys}
                expectedOutputSchemaKeys={expectedOutputSchemaKeys}
                useDirectMappingForInput={useDirectMappingForInput}
                useDirectMappingForExpectedOutput={
                  useDirectMappingForExpectedOutput
                }
                onToggleDirectMappingForInput={setUseDirectMappingForInput}
                onToggleDirectMappingForExpectedOutput={
                  setUseDirectMappingForExpectedOutput
                }
              />
            </div>
            {createPortal(
              <DragOverlay dropAnimation={null} adjustScale={false}>
                {dragAndDrop.activeColumn ? (
                  dragAndDrop.activeColumn.startsWith("mapped-") ? (
                    <div className="cursor-grabbing rounded-md bg-accent-dark-blue px-2 py-1 text-sm font-medium text-muted-foreground shadow-xl">
                      {dragAndDrop.activeColumn.replace("mapped-", "")}
                    </div>
                  ) : (
                    <div className="flex cursor-grabbing items-center gap-2 rounded-md border bg-background p-2 shadow-xl">
                      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span className="truncate text-sm">
                          {dragAndDrop.activeColumn}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {
                            preview.columns.find(
                              (col) => col.name === dragAndDrop.activeColumn,
                            )?.inferredType
                          }
                        </span>
                      </div>
                    </div>
                  )
                ) : null}
              </DragOverlay>,
              document.body,
            )}
          </DndContext>
        </div>
        {csvImport.validationErrors.length > 0 && (
          <CsvImportValidationError errors={csvImport.validationErrors} />
        )}
      </DialogBody>
      <DialogFooter>
        {/* Show checkbox in freeform mode OR when using direct mapping for any field */}
        {(useDirectMappingForInput ||
          useDirectMappingForExpectedOutput ||
          !isSchemaMode) && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="wrapSingleColumn"
              checked={wrapSingleColumn}
              onCheckedChange={(checked) =>
                setWrapSingleColumn(checked === true)
              }
            />
            <Label
              htmlFor="wrapSingleColumn"
              className="cursor-pointer text-sm font-normal"
            >
              Force Objects
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[300px]">
                When a single csv column is mapped to a dataset item field, wrap
                its value in an object instead of using the raw value. Example:{" "}
                {`{"columnName": "value"}`} instead of {`"value"`}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        <Button variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
        <Button
          disabled={
            mapping.isEmpty() || csvImport.progress.status === "processing"
          }
          loading={csvImport.progress.status === "processing"}
          onClick={handleImport}
        >
          {csvImport.progress.status === "processing"
            ? "Importing..."
            : "Import"}
        </Button>
        {csvImport.progress.status === "processing" && (
          <div className="mt-2">
            <Progress
              value={
                (csvImport.progress.processedItems /
                  csvImport.progress.totalItems) *
                100
              }
              className="w-full"
            />
          </div>
        )}
      </DialogFooter>
    </>
  );
}
