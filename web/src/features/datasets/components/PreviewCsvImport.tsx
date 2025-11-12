import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { ImportCard } from "./ImportCard";
import {
  DndContext,
  closestCenter,
  DragOverlay,
  MeasuringStrategy,
} from "@dnd-kit/core";
import { createPortal } from "react-dom";
import { findDefaultColumn } from "../lib/findDefaultColumn";
import { type DragEndEvent } from "@dnd-kit/core";
import { z } from "zod/v4";
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

const CardIdSchema = z.enum(["input", "expected", "metadata", "unmapped"]);
type CardId = z.infer<typeof CardIdSchema>;

type ImportProgress = {
  totalItems: number;
  processedItems: number;
  status: "not-started" | "processing" | "complete";
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function moveColumn(
  fromId: CardId,
  toId: CardId,
  columnName: string,
  sets: {
    input: Set<string>;
    expected: Set<string>;
    metadata: Set<string>;
    unmapped: Set<string>;
  },
  setters: {
    input: (s: Set<string>) => void;
    expected: (s: Set<string>) => void;
    metadata: (s: Set<string>) => void;
    unmapped: (s: Set<string>) => void;
  },
) {
  sets[fromId].delete(columnName);
  setters[fromId](new Set(sets[fromId]));

  sets[toId].add(columnName);
  setters[toId](new Set(sets[toId]));
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
  const [excludedColumns, setExcludedColumns] = useState<Set<string>>(
    new Set(),
  );

  // Schema mode state
  const [inputSchemaMapping, setInputSchemaMapping] = useState<
    Map<string, string>
  >(new Map());
  const [expectedOutputSchemaMapping, setExpectedOutputSchemaMapping] =
    useState<Map<string, string>>(new Map());
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

    const columnName = active.id as string;
    const fromCardId = active.data.current?.fromCardId;
    const toId = over.id as string;

    if (isSchemaMode) {
      // Mixed/Schema mode: handle drops onto schema keys OR freeform fields
      if (toId.includes(":")) {
        // Drop on schema key: format is "input:country" or "expectedOutput:city"
        const [cardType, schemaKey] = toId.split(":");
        if (!schemaKey) return;

        // Remove from previous location
        if (fromCardId === "input") {
          // Check if it was in schema mapping or freeform
          const newMapping = new Map(inputSchemaMapping);
          let wasInMapping = false;
          for (const [key, col] of newMapping.entries()) {
            if (col === columnName) {
              newMapping.delete(key);
              wasInMapping = true;
              break;
            }
          }
          if (wasInMapping) {
            setInputSchemaMapping(newMapping);
          } else {
            selectedInputColumn.delete(columnName);
            setSelectedInputColumn(new Set(selectedInputColumn));
          }
        } else if (fromCardId === "expectedOutput") {
          const newMapping = new Map(expectedOutputSchemaMapping);
          let wasInMapping = false;
          for (const [key, col] of newMapping.entries()) {
            if (col === columnName) {
              newMapping.delete(key);
              wasInMapping = true;
              break;
            }
          }
          if (wasInMapping) {
            setExpectedOutputSchemaMapping(newMapping);
          } else {
            selectedExpectedColumn.delete(columnName);
            setSelectedExpectedColumn(new Set(selectedExpectedColumn));
          }
        } else if (fromCardId === "unmapped") {
          unmappedColumns.delete(columnName);
          setUnmappedColumns(new Set(unmappedColumns));
        }

        // Add to new mapping
        if (cardType === "input") {
          const newMapping = new Map(inputSchemaMapping);
          newMapping.set(schemaKey, columnName);
          setInputSchemaMapping(newMapping);
        } else if (cardType === "expectedOutput") {
          const newMapping = new Map(expectedOutputSchemaMapping);
          newMapping.set(schemaKey, columnName);
          setExpectedOutputSchemaMapping(newMapping);
        }
      } else if (
        toId === "input" ||
        toId === "expectedOutput" ||
        toId === "unmapped"
      ) {
        // Drop on freeform card or unmapped
        // Remove from previous location
        if (fromCardId === "input") {
          const newMapping = new Map(inputSchemaMapping);
          let wasInMapping = false;
          for (const [key, col] of newMapping.entries()) {
            if (col === columnName) {
              newMapping.delete(key);
              wasInMapping = true;
              break;
            }
          }
          if (wasInMapping) {
            setInputSchemaMapping(newMapping);
          } else {
            selectedInputColumn.delete(columnName);
            setSelectedInputColumn(new Set(selectedInputColumn));
          }
        } else if (fromCardId === "expectedOutput") {
          const newMapping = new Map(expectedOutputSchemaMapping);
          let wasInMapping = false;
          for (const [key, col] of newMapping.entries()) {
            if (col === columnName) {
              newMapping.delete(key);
              wasInMapping = true;
              break;
            }
          }
          if (wasInMapping) {
            setExpectedOutputSchemaMapping(newMapping);
          } else {
            selectedExpectedColumn.delete(columnName);
            setSelectedExpectedColumn(new Set(selectedExpectedColumn));
          }
        } else if (fromCardId === "unmapped") {
          unmappedColumns.delete(columnName);
          setUnmappedColumns(new Set(unmappedColumns));
        }

        // Add to new location
        if (toId === "input") {
          selectedInputColumn.add(columnName);
          setSelectedInputColumn(new Set(selectedInputColumn));
        } else if (toId === "expectedOutput") {
          selectedExpectedColumn.add(columnName);
          setSelectedExpectedColumn(new Set(selectedExpectedColumn));
        } else if (toId === "unmapped") {
          unmappedColumns.add(columnName);
          setUnmappedColumns(new Set(unmappedColumns));
        }
      }
    } else {
      // Pure freeform mode
      if (fromCardId === toId) return;

      const parsedFromCardId = CardIdSchema.safeParse(fromCardId);
      const parsedToCardId = CardIdSchema.safeParse(toId);

      if (!parsedFromCardId.success || !parsedToCardId.success) return;

      moveColumn(
        parsedFromCardId.data,
        parsedToCardId.data,
        columnName,
        {
          input: selectedInputColumn,
          expected: selectedExpectedColumn,
          metadata: selectedMetadataColumn,
          unmapped: excludedColumns,
        },
        {
          input: setSelectedInputColumn,
          expected: setSelectedExpectedColumn,
          metadata: setSelectedMetadataColumn,
          unmapped: setExcludedColumns,
        },
      );
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
      ? Object.fromEntries(inputSchemaMapping)
      : undefined;
    const expectedOutputMapping = isSchemaMode
      ? Object.fromEntries(expectedOutputSchemaMapping)
      : undefined;

    try {
      await parseCsvClient(csvFile, {
        processor: {
          onHeader: (headers) => {
            headerMap = new Map(headers.map((h, i) => [h, i]));

            // Validate columns exist (check both schema mappings and freeform columns)
            const allColumns = [
              ...Object.values(inputMapping ?? {}),
              ...Object.values(expectedOutputMapping ?? {}),
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
        <Card className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden border-none pb-4">
          <CardHeader className="shrink-0 text-center">
            <CardTitle className="text-lg">Import {preview.fileName}</CardTitle>
            <CardDescription>
              {isSchemaMode
                ? "Drag CSV columns to the schema fields below to map them."
                : "Map your CSV columns to dataset fields. The CSV file must have column headers in the first row."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 w-full flex-1 flex-col gap-3 p-2">
            <DndContext
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              onDragStart={(event) =>
                setActiveColumn(event.active.id as string)
              }
              measuring={{
                droppable: {
                  strategy: MeasuringStrategy.Always,
                },
              }}
            >
              <div className="min-h-0 flex-1">
                {isSchemaMode ? (
                  // Schema mode layout (mixed mode: some fields have schemas, some don't)
                  <div className="grid h-full grid-cols-2 gap-4 lg:grid-cols-3">
                    <ImportCard
                      id="input"
                      title="Input"
                      columns={
                        inputSchemaKeys && inputSchemaKeys.length > 0
                          ? []
                          : preview.columns.filter((col) =>
                              selectedInputColumn.has(col.name),
                            )
                      }
                      schemaKeys={inputSchemaKeys ?? undefined}
                      schemaKeyMapping={inputSchemaMapping}
                      onColumnSelect={() => {}}
                      onColumnRemove={() => {}}
                    />
                    <ImportCard
                      id="expectedOutput"
                      title="Expected Output"
                      columns={
                        expectedOutputSchemaKeys &&
                        expectedOutputSchemaKeys.length > 0
                          ? []
                          : preview.columns.filter((col) =>
                              selectedExpectedColumn.has(col.name),
                            )
                      }
                      schemaKeys={expectedOutputSchemaKeys ?? undefined}
                      schemaKeyMapping={expectedOutputSchemaMapping}
                      onColumnSelect={() => {}}
                      onColumnRemove={() => {}}
                    />
                    <ImportCard
                      id="unmapped"
                      title="Available Columns"
                      info="Drag these columns to schema fields to map them."
                      columns={preview.columns.filter((col) =>
                        unmappedColumns.has(col.name),
                      )}
                      onColumnSelect={() => {}}
                      onColumnRemove={() => {}}
                      className="bg-secondary/50"
                    />
                  </div>
                ) : (
                  // Freeform mode layout
                  <div className="grid h-full grid-cols-2 gap-4 lg:grid-cols-4">
                    <ImportCard
                      id="input"
                      title="Input"
                      columns={preview.columns.filter((col) =>
                        selectedInputColumn.has(col.name),
                      )}
                      onColumnSelect={(columnName) => {
                        setSelectedInputColumn(
                          new Set([...selectedInputColumn, columnName]),
                        );
                      }}
                      onColumnRemove={(columnName) => {
                        setSelectedInputColumn(
                          new Set(
                            [...selectedInputColumn].filter(
                              (col) => col !== columnName,
                            ),
                          ),
                        );
                      }}
                    />
                    <ImportCard
                      id="expected"
                      title="Expected Output"
                      columns={preview.columns.filter((col) =>
                        selectedExpectedColumn.has(col.name),
                      )}
                      onColumnSelect={(columnName) => {
                        setSelectedExpectedColumn(
                          new Set([...selectedExpectedColumn, columnName]),
                        );
                      }}
                      onColumnRemove={(columnName) => {
                        setSelectedExpectedColumn(
                          new Set(
                            [...selectedExpectedColumn].filter(
                              (col) => col !== columnName,
                            ),
                          ),
                        );
                      }}
                    />
                    <ImportCard
                      id="metadata"
                      title="Metadata"
                      columns={preview.columns.filter((col) =>
                        selectedMetadataColumn.has(col.name),
                      )}
                      onColumnSelect={(columnName) => {
                        setSelectedMetadataColumn(
                          new Set([...selectedMetadataColumn, columnName]),
                        );
                      }}
                      onColumnRemove={(columnName) => {
                        setSelectedMetadataColumn(
                          new Set(
                            [...selectedMetadataColumn].filter(
                              (col) => col !== columnName,
                            ),
                          ),
                        );
                      }}
                    />
                    <ImportCard
                      id="unmapped"
                      title="Not mapped"
                      info="These columns from your CSV will not be imported. Drag them to a field to include them."
                      columns={preview.columns.filter((col) =>
                        excludedColumns.has(col.name),
                      )}
                      onColumnSelect={(columnName) => {
                        setExcludedColumns(
                          new Set([...excludedColumns, columnName]),
                        );
                      }}
                      onColumnRemove={(columnName) => {
                        setExcludedColumns(
                          new Set(
                            [...excludedColumns].filter(
                              (col) => col !== columnName,
                            ),
                          ),
                        );
                      }}
                      className="bg-secondary/50"
                    />
                  </div>
                )}
              </div>
              {createPortal(
                <DragOverlay dropAnimation={null} adjustScale={false}>
                  {activeColumn ? (
                    <div className="cursor-grabbing rounded-md border bg-background p-2 shadow-xl ring-2 ring-primary">
                      <div className="flex items-center justify-between space-x-2">
                        <span className="text-sm font-medium">
                          {activeColumn}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {
                            preview.columns.find(
                              (col) => col.name === activeColumn,
                            )?.inferredType
                          }
                        </span>
                      </div>
                    </div>
                  ) : null}
                </DragOverlay>,
                document.body,
              )}
            </DndContext>
          </CardContent>
        </Card>
        {validationErrors.length > 0 && (
          <CsvImportValidationError errors={validationErrors} />
        )}
      </DialogBody>
      <DialogFooter>
        {/* {!isSchemaMode && ( */}
        <div className="flex w-full flex-1 items-start gap-2">
          <Checkbox
            id="wrapSingleColumn"
            checked={wrapSingleColumn}
            onCheckedChange={(checked) => setWrapSingleColumn(checked === true)}
          />
          <div className="grid">
            <Label
              htmlFor="wrapSingleColumn"
              className="-mt-1 cursor-pointer text-sm font-normal"
            >
              Force Objects
            </Label>
            <p className="text-sm text-muted-foreground">
              Wrap single column values as objects (e.g., {`{"col": "value"}`}{" "}
              instead of {`"value"`})
            </p>
          </div>
        </div>
        {/* )} */}
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
