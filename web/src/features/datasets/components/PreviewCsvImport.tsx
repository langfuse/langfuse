import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { ImportCard } from "./ImportCard";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { findDefaultColumn } from "../lib/findDefaultColumn";
import { type DragEndEvent } from "@dnd-kit/core";
import { z } from "zod/v4";
import { useEffect, useState } from "react";
import {
  parseCsvClient,
  parseColumns,
  type CsvPreviewResult,
} from "@/src/features/datasets/lib/csvHelpers";
import { Button } from "@/src/components/ui/button";
import { api, type RouterInputs } from "@/src/utils/api";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { MAX_FILE_SIZE_BYTES } from "@/src/features/datasets/components/UploadDatasetCsv";
import { Progress } from "@/src/components/ui/progress";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { DialogBody, DialogFooter } from "@/src/components/ui/dialog";

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

function chunkArray<T>(array: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
    array.slice(i * size, i * size + size),
  );
}

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
  const [progress, setProgress] = useState<ImportProgress>({
    totalItems: 0,
    processedItems: 0,
    status: "not-started",
  });

  const utils = api.useUtils();
  const mutCreateManyDatasetItems =
    api.datasets.createManyDatasetItems.useMutation({});

  useEffect(() => {
    if (preview) {
      // Only set defaults if no columns are currently selected
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

        // Set default columns based on names
        defaultInput && setSelectedInputColumn(new Set([defaultInput]));
        defaultExpected &&
          setSelectedExpectedColumn(new Set([defaultExpected]));
        defaultMetadata &&
          setSelectedMetadataColumn(new Set([defaultMetadata]));

        // Update excluded columns based on current selections
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]); // Only depend on preview changes

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    const columnName = active.id as string;
    const fromCardId = active.data.current?.fromCardId;
    const toCardId = over.id;

    if (fromCardId === toCardId) return;

    const parsedFromCardId = CardIdSchema.safeParse(fromCardId);
    const parsedToCardId = CardIdSchema.safeParse(toCardId);

    if (!parsedFromCardId.success || !parsedToCardId.success) return;

    // Handle moving column between cards
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
  };

  const handleImport = async () => {
    capture("dataset_item:upload_csv_form_submit");
    if (!csvFile) return;
    if (csvFile.size > MAX_FILE_SIZE_BYTES) {
      showErrorToast("File too large", "Maximum file size is 10MB");
      return;
    }

    let processedCount = 0;
    let headerMap: Map<string, number>;

    const items: RouterInputs["datasets"]["createManyDatasetItems"]["items"] =
      [];
    const input = Array.from(selectedInputColumn);
    const expected = Array.from(selectedExpectedColumn);
    const metadata = Array.from(selectedMetadataColumn);

    try {
      await parseCsvClient(csvFile, {
        processor: {
          onHeader: (headers) => {
            headerMap = new Map(headers.map((h, i) => [h, i]));

            // Validate columns exist
            const missingColumns = [...input, ...expected, ...metadata].filter(
              (col) => !headerMap.has(col),
            );
            if (missingColumns.length > 0) {
              throw new Error(`Missing columns: ${missingColumns.join(", ")}`);
            }
          },
          onRow: (row, _, index) => {
            try {
              // Process all column mappings
              const itemInput =
                parseColumns(input, row, headerMap) ?? undefined;
              const itemExpected =
                parseColumns(expected, row, headerMap) ?? undefined;
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
      const chunks = chunkArray(items, optimalChunkSize);

      for (const [index, chunk] of chunks.entries()) {
        await mutCreateManyDatasetItems.mutateAsync({
          projectId,
          items: chunk,
        });

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
              Map your CSV columns to dataset fields. The CSV file must have
              column headers in the first row.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 w-full flex-1 flex-col p-2">
            <div className="min-h-0 flex-1">
              <DndContext
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
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
              </DndContext>
            </div>
          </CardContent>
        </Card>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => {
            setPreview(null);
            setSelectedInputColumn(new Set());
            setSelectedExpectedColumn(new Set());
            setSelectedMetadataColumn(new Set());
            setExcludedColumns(new Set());
            setCsvFile(null);
          }}
        >
          Cancel
        </Button>
        <Button
          disabled={
            (selectedInputColumn.size === 0 &&
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
