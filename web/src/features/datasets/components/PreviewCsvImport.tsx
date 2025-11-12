import { CsvColumnsCard } from "./CsvColumnsCard";
import { MappingCard } from "./MappingCard";
import {
  DndContext,
  closestCenter,
  DragOverlay,
  MeasuringStrategy,
} from "@dnd-kit/core";
import { createPortal } from "react-dom";
import { findDefaultColumn } from "../lib/findDefaultColumn";
import { type DragEndEvent } from "@dnd-kit/core";
import { useEffect, useState } from "react";
import {
  parseCsvClient,
  parseColumns,
  buildSchemaObject,
  type CsvPreviewResult,
} from "@/src/features/datasets/lib/csvHelpers";
import { Button } from "@/src/components/ui/button";
import { api, type RouterInputs } from "@/src/utils/api";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { MAX_FILE_SIZE_BYTES } from "@/src/features/datasets/components/UploadDatasetCsv";
import { Progress } from "@/src/components/ui/progress";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { DialogBody, DialogFooter } from "@/src/components/ui/dialog";
import { CsvImportValidationError } from "./CsvImportValidationError";
import { type BulkDatasetItemValidationError } from "@langfuse/shared";
import { chunk } from "lodash";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Label } from "@/src/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { InfoIcon, GripVertical } from "lucide-react";

const MIN_CHUNK_SIZE = 1;
const CHUNK_START_SIZE = 50;
const DELAY_BETWEEN_CHUNKS = 100; // milliseconds

// Max payload size is 1MB, but we must account for any trpc wrapper data and context
const MAX_PAYLOAD_SIZE = 500 * 1024; // 500KB in bytes

function getOptimalChunkSize(items: any[], startSize: number): number {
  const getPayloadSize = (size: number) =>
    new TextEncoder().encode(
      JSON.stringify({
        projectId: "test",
        datasetId: "test",
        items: items.slice(0, size),
      }),
    ).length;

  // Binary search for largest chunk size under MAX_PAYLOAD_SIZE
  let low = MIN_CHUNK_SIZE;
  let high = startSize;
  let best = MIN_CHUNK_SIZE;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (getPayloadSize(mid) <= MAX_PAYLOAD_SIZE) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

type ImportProgress = {
  totalItems: number;
  processedItems: number;
  status: "not-started" | "processing" | "complete";
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const isSchemaMode =
    (inputSchemaKeys && inputSchemaKeys.length > 0) ||
    (expectedOutputSchemaKeys && expectedOutputSchemaKeys.length > 0);

  // Freeform mode state
  const [selectedInputColumn, setSelectedInputColumn] = useState<Set<string>>(
    new Set(),
  );
  const [selectedExpectedColumn, setSelectedExpectedColumn] = useState<
    Set<string>
  >(new Set());
  const [selectedMetadataColumn, setSelectedMetadataColumn] = useState<
    Set<string>
  >(new Set());
  const [_excludedColumns, setExcludedColumns] = useState<Set<string>>(
    new Set(),
  );

  // Schema mode state (now supports multiple columns per schema key)
  const [inputSchemaMapping, setInputSchemaMapping] = useState<
    Map<string, CsvColumnPreview[]>
  >(new Map());
  const [expectedOutputSchemaMapping, setExpectedOutputSchemaMapping] =
    useState<Map<string, CsvColumnPreview[]>>(new Map());
  const [unmappedColumns, setUnmappedColumns] = useState<Set<string>>(
    new Set(),
  );

  // Wrapping checkbox
  const [wrapSingleColumn, setWrapSingleColumn] = useState(false);

  // Drag state for overlay
  const [activeColumn, setActiveColumn] = useState<string | null>(null);

  const [progress, setProgress] = useState<ImportProgress>({
    totalItems: 0,
    processedItems: 0,
    status: "not-started",
  });
  const [validationErrors, setValidationErrors] = useState<
    BulkDatasetItemValidationError[]
  >([]);

  const utils = api.useUtils();
  const mutCreateManyDatasetItems =
    api.datasets.createManyDatasetItems.useMutation({});

  useEffect(() => {
    if (preview && !isSchemaMode) {
      // Freeform mode: set defaults only if no columns selected
      if (
        selectedInputColumn.size === 0 &&
        selectedExpectedColumn.size === 0 &&
        selectedMetadataColumn.size === 0
      ) {
        const defaultInput = findDefaultColumn(preview.columns, "Input", 0);
        const defaultExpected = findDefaultColumn(
          preview.columns,
          "Expected",
          1,
        );
        const defaultMetadata = findDefaultColumn(
          preview.columns,
          "Metadata",
          2,
        );

        defaultInput && setSelectedInputColumn(new Set([defaultInput]));
        defaultExpected &&
          setSelectedExpectedColumn(new Set([defaultExpected]));
        defaultMetadata &&
          setSelectedMetadataColumn(new Set([defaultMetadata]));

        const newExcluded = new Set(
          preview.columns
            .filter(
              (col) =>
                defaultInput !== col.name &&
                defaultExpected !== col.name &&
                defaultMetadata !== col.name,
            )
            .map((col) => col.name),
        );

        setExcludedColumns(newExcluded);
      }
    } else if (preview && isSchemaMode) {
      // Schema mode: initialize unmapped columns
      if (unmappedColumns.size === 0) {
        setUnmappedColumns(new Set(preview.columns.map((col) => col.name)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, isSchemaMode]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveColumn(null);

    if (!over) return;

    const activeId = active.id as string;
    const fromCardId = active.data.current?.fromCardId;
    const column = active.data.current?.column as CsvColumnPreview;
    const toId = over.id as string;

    if (!column) return;

    // Only proceed if dropping on a valid drop zone
    const isValidDropZone =
      toId.includes(":") || // schema key drop zones
      toId === "input" ||
      toId === "expected" ||
      toId === "metadata";

    if (!isValidDropZone) return;

    // Helper to remove column from all mappings
    const removeFromAllMappings = () => {
      // Remove from input schema mapping
      const inputMapping = new Map(inputSchemaMapping);
      for (const [key, cols] of inputMapping.entries()) {
        const filtered = cols.filter((c) => c.name !== column.name);
        if (filtered.length === 0) {
          inputMapping.delete(key);
        } else if (filtered.length !== cols.length) {
          inputMapping.set(key, filtered);
        }
      }
      setInputSchemaMapping(inputMapping);

      // Remove from expected schema mapping
      const expectedMapping = new Map(expectedOutputSchemaMapping);
      for (const [key, cols] of expectedMapping.entries()) {
        const filtered = cols.filter((c) => c.name !== column.name);
        if (filtered.length === 0) {
          expectedMapping.delete(key);
        } else if (filtered.length !== cols.length) {
          expectedMapping.set(key, filtered);
        }
      }
      setExpectedOutputSchemaMapping(expectedMapping);

      // Remove from freeform selections
      selectedInputColumn.delete(column.name);
      setSelectedInputColumn(new Set(selectedInputColumn));
      selectedExpectedColumn.delete(column.name);
      setSelectedExpectedColumn(new Set(selectedExpectedColumn));
      selectedMetadataColumn.delete(column.name);
      setSelectedMetadataColumn(new Set(selectedMetadataColumn));
    };

    // Handle schema key drops (format: "input:key" or "expectedOutput:key")
    if (toId.includes(":")) {
      const [cardType, schemaKey] = toId.split(":");
      if (!schemaKey) return;

      // Remove from previous mappings
      if (fromCardId === "mapped") {
        removeFromAllMappings();
      }

      // Add to new mapping
      if (cardType === "input") {
        const newMapping = new Map(inputSchemaMapping);
        const existing = newMapping.get(schemaKey) ?? [];
        newMapping.set(schemaKey, [...existing, column]);
        setInputSchemaMapping(newMapping);
      } else if (cardType === "expectedOutput") {
        const newMapping = new Map(expectedOutputSchemaMapping);
        const existing = newMapping.get(schemaKey) ?? [];
        newMapping.set(schemaKey, [...existing, column]);
        setExpectedOutputSchemaMapping(newMapping);
      }
      return;
    }

    // Handle freeform drops (input, expected, metadata)
    if (toId === "input" || toId === "expected" || toId === "metadata") {
      // Remove from previous mappings if exists
      if (fromCardId === "mapped") {
        removeFromAllMappings();
      }

      // Add to new location
      if (toId === "input") {
        setSelectedInputColumn(new Set([...selectedInputColumn, column.name]));
      } else if (toId === "expected") {
        setSelectedExpectedColumn(
          new Set([...selectedExpectedColumn, column.name]),
        );
      } else if (toId === "metadata") {
        setSelectedMetadataColumn(
          new Set([...selectedMetadataColumn, column.name]),
        );
      }
    }
  };

  const handleImport = async () => {
    capture("dataset_item:upload_csv_form_submit");
    if (!csvFile) return;
    if (csvFile.size > MAX_FILE_SIZE_BYTES) {
      showErrorToast("File too large", "Maximum file size is 10MB");
      return;
    }

    // Clear any previous validation errors
    setValidationErrors([]);

    let processedCount = 0;
    let headerMap: Map<string, number>;

    const items: RouterInputs["datasets"]["createManyDatasetItems"]["items"] =
      [];

    // Prepare column lists or mappings based on mode
    // In schema mode, still use freeform columns for fields without schema
    const input = Array.from(selectedInputColumn);
    const expected = Array.from(selectedExpectedColumn);
    const metadata = Array.from(selectedMetadataColumn);

    const inputMapping = isSchemaMode
      ? Object.fromEntries(
          Array.from(inputSchemaMapping.entries()).map(([key, cols]) => [
            key,
            cols.map((c) => c.name),
          ]),
        )
      : undefined;
    const expectedOutputMapping = isSchemaMode
      ? Object.fromEntries(
          Array.from(expectedOutputSchemaMapping.entries()).map(
            ([key, cols]) => [key, cols.map((c) => c.name)],
          ),
        )
      : undefined;

    try {
      await parseCsvClient(csvFile, {
        processor: {
          onHeader: (headers) => {
            headerMap = new Map(headers.map((h, i) => [h, i]));

            // Validate columns exist (check both schema mappings and freeform columns)
            const allColumns = [
              ...Object.values(inputMapping ?? {}).flat(),
              ...Object.values(expectedOutputMapping ?? {}).flat(),
              ...input,
              ...expected,
              ...metadata,
            ];
            const missingColumns = allColumns.filter(
              (col) => !headerMap.has(col),
            );
            if (missingColumns.length > 0) {
              throw new Error(`Missing columns: ${missingColumns.join(", ")}`);
            }
          },
          onRow: (row, _, index) => {
            try {
              // Process based on mode (mixed mode: some fields have schemas, some don't)
              let itemInput: unknown;
              let itemExpected: unknown;

              if (isSchemaMode) {
                // Input: use schema mapping if available, else freeform
                if (inputMapping && Object.keys(inputMapping).length > 0) {
                  itemInput = buildSchemaObject(inputMapping, row, headerMap);
                } else {
                  itemInput =
                    parseColumns(input, row, headerMap, { wrapSingleColumn }) ??
                    undefined;
                }

                // Expected output: use schema mapping if available, else freeform
                if (
                  expectedOutputMapping &&
                  Object.keys(expectedOutputMapping).length > 0
                ) {
                  itemExpected = buildSchemaObject(
                    expectedOutputMapping,
                    row,
                    headerMap,
                  );
                } else {
                  itemExpected =
                    parseColumns(expected, row, headerMap, {
                      wrapSingleColumn,
                    }) ?? undefined;
                }
              } else {
                // Pure freeform mode
                itemInput =
                  parseColumns(input, row, headerMap, { wrapSingleColumn }) ??
                  undefined;
                itemExpected =
                  parseColumns(expected, row, headerMap, {
                    wrapSingleColumn,
                  }) ?? undefined;
              }

              const itemMetadata =
                parseColumns(metadata, row, headerMap) ?? undefined;

              items.push({
                input: JSON.stringify(itemInput),
                expectedOutput: JSON.stringify(itemExpected),
                metadata: JSON.stringify(itemMetadata),
                datasetId,
              });
            } catch (error) {
              throw new Error(
                `Error processing row ${index + 1}: ${error instanceof Error ? error.message : "Unknown error"}`,
              );
            }
          },
        },
      });

      const optimalChunkSize = getOptimalChunkSize(items, CHUNK_START_SIZE);
      const chunks = chunk(items, optimalChunkSize);

      for (const [index, chunk] of chunks.entries()) {
        const result = await mutCreateManyDatasetItems.mutateAsync({
          projectId,
          items: chunk,
        });

        // Check if validation failed
        if (!result.success) {
          // Adjust itemIndex to account for already processed chunks
          const adjustedErrors = result.validationErrors.map((error) => ({
            ...error,
            itemIndex: error.itemIndex + processedCount,
          }));

          setValidationErrors(adjustedErrors);
          setProgress?.({
            totalItems: 0,
            processedItems: 0,
            status: "not-started",
          });
          return;
        }

        processedCount += chunk.length;
        setProgress?.({
          totalItems: items.length,
          processedItems: processedCount,
          status: "processing",
        });

        // Add delay between chunks
        if (index < chunks.length - 1) {
          // Skip delay after last chunk
          await sleep(DELAY_BETWEEN_CHUNKS);
        }
      }
    } catch (error) {
      utils.datasets.invalidate();
      setProgress?.({
        totalItems: 0,
        processedItems: 0,
        status: "not-started",
      });
      if (error instanceof Error && processedCount === 0) {
        showErrorToast("Failed to import all dataset items", error.message);
      } else {
        showErrorToast(
          "Failed to import all dataset items",
          `Please try again starting from row ${processedCount + 1}.`,
        );
      }
      return;
    }

    utils.datasets.invalidate();
    setOpen?.(false);
    setPreview(null);

    setProgress?.({
      totalItems: items.length,
      processedItems: items.length,
      status: "complete",
    });
  };

  return (
    <>
      <DialogBody className="border-t">
        <div className="flex min-h-0 w-full flex-1 flex-col gap-3 px-2 py-1">
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            onDragStart={(event) => setActiveColumn(event.active.id as string)}
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
                inputSchemaKeys={inputSchemaKeys ?? undefined}
                expectedOutputSchemaKeys={expectedOutputSchemaKeys ?? undefined}
                inputSchemaMapping={inputSchemaMapping}
                expectedOutputSchemaMapping={expectedOutputSchemaMapping}
                inputColumns={preview.columns.filter((col) =>
                  selectedInputColumn.has(col.name),
                )}
                expectedColumns={preview.columns.filter((col) =>
                  selectedExpectedColumn.has(col.name),
                )}
                metadataColumns={preview.columns.filter((col) =>
                  selectedMetadataColumn.has(col.name),
                )}
                onRemoveInputColumn={(columnName) => {
                  setSelectedInputColumn(
                    new Set(
                      [...selectedInputColumn].filter(
                        (col) => col !== columnName,
                      ),
                    ),
                  );
                }}
                onRemoveExpectedColumn={(columnName) => {
                  setSelectedExpectedColumn(
                    new Set(
                      [...selectedExpectedColumn].filter(
                        (col) => col !== columnName,
                      ),
                    ),
                  );
                }}
                onRemoveMetadataColumn={(columnName) => {
                  setSelectedMetadataColumn(
                    new Set(
                      [...selectedMetadataColumn].filter(
                        (col) => col !== columnName,
                      ),
                    ),
                  );
                }}
                onRemoveInputSchemaColumn={(schemaKey, columnName) => {
                  const newMapping = new Map(inputSchemaMapping);
                  const existing = newMapping.get(schemaKey) ?? [];
                  const filtered = existing.filter(
                    (c) => c.name !== columnName,
                  );
                  if (filtered.length === 0) {
                    newMapping.delete(schemaKey);
                  } else {
                    newMapping.set(schemaKey, filtered);
                  }
                  setInputSchemaMapping(newMapping);
                }}
                onRemoveExpectedSchemaColumn={(schemaKey, columnName) => {
                  const newMapping = new Map(expectedOutputSchemaMapping);
                  const existing = newMapping.get(schemaKey) ?? [];
                  const filtered = existing.filter(
                    (c) => c.name !== columnName,
                  );
                  if (filtered.length === 0) {
                    newMapping.delete(schemaKey);
                  } else {
                    newMapping.set(schemaKey, filtered);
                  }
                  setExpectedOutputSchemaMapping(newMapping);
                }}
              />
            </div>
            {createPortal(
              <DragOverlay dropAnimation={null} adjustScale={false}>
                {activeColumn ? (
                  activeColumn.startsWith("mapped-") ? (
                    <div className="cursor-grabbing rounded-md bg-accent-dark-blue px-2 py-1 text-sm font-medium text-muted-foreground shadow-xl">
                      {activeColumn.replace("mapped-", "")}
                    </div>
                  ) : (
                    <div className="flex cursor-grabbing items-center gap-2 rounded-md border bg-background p-2 shadow-xl">
                      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span className="truncate text-sm">{activeColumn}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {
                            preview.columns.find(
                              (col) => col.name === activeColumn,
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
        {validationErrors.length > 0 && (
          <CsvImportValidationError errors={validationErrors} />
        )}
      </DialogBody>
      <DialogFooter>
        <div className="flex items-center gap-2">
          <Checkbox
            id="wrapSingleColumn"
            checked={wrapSingleColumn}
            onCheckedChange={(checked) => setWrapSingleColumn(checked === true)}
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
        <Button
          variant="outline"
          onClick={() => {
            setPreview(null);
            setSelectedInputColumn(new Set());
            setSelectedExpectedColumn(new Set());
            setSelectedMetadataColumn(new Set());
            setExcludedColumns(new Set());
            setInputSchemaMapping(new Map());
            setExpectedOutputSchemaMapping(new Map());
            setUnmappedColumns(new Set());
            setCsvFile(null);
            setValidationErrors([]);
          }}
        >
          Cancel
        </Button>
        <Button
          disabled={
            (isSchemaMode
              ? inputSchemaMapping.size === 0 &&
                expectedOutputSchemaMapping.size === 0 &&
                selectedInputColumn.size === 0 &&
                selectedExpectedColumn.size === 0
              : selectedInputColumn.size === 0 &&
                selectedExpectedColumn.size === 0 &&
                selectedMetadataColumn.size === 0) ||
            progress.status === "processing"
          }
          loading={progress.status === "processing"}
          onClick={handleImport}
        >
          {progress.status === "processing" ? "Importing..." : "Import"}
        </Button>
        {progress.status === "processing" && (
          <div className="mt-2">
            <Progress
              value={(progress.processedItems / progress.totalItems) * 100}
              className="w-full"
            />
          </div>
        )}
      </DialogFooter>
    </>
  );
}
