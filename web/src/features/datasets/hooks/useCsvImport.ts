import { useState } from "react";
import { type RouterInputs, api } from "@/src/utils/api";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { MAX_FILE_SIZE_BYTES } from "@/src/features/datasets/components/UploadDatasetCsv";
import {
  type BulkDatasetItemValidationError,
  type DatasetItemMediaField,
} from "@langfuse/shared";
import chunk from "lodash/chunk";
import {
  parseCsvClient,
  parseColumns,
  buildSchemaObject,
} from "@/src/features/datasets/lib/csv/helpers";
import { rewriteCsvFieldMedia } from "@/src/features/datasets/lib/csv/csvMedia";
import type {
  CsvColumnPreview,
  FieldMapping,
} from "@/src/features/datasets/lib/csv/types";
import { safeRandomUUID } from "@/src/utils/safe-random-uuid";

const MIN_CHUNK_SIZE = 1;
const CHUNK_START_SIZE = 50;
const DELAY_BETWEEN_CHUNKS = 100; // milliseconds
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ImportProgress = {
  totalItems: number;
  processedItems: number;
  status: "not-started" | "processing" | "complete";
};

type UseCsvImportOptions = {
  projectId: string;
  datasetId: string;
  csvFile: File | null;
  input: FieldMapping;
  expectedOutput: FieldMapping;
  metadata: CsvColumnPreview[];
};

type ParsedCsvItem = {
  id: string;
  datasetId: string;
  input: unknown;
  expectedOutput: unknown;
  metadata: unknown;
};

export function useCsvImport(options: UseCsvImportOptions) {
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
  const ingestItemMediaFromUrl =
    api.datasets.ingestItemMediaFromUrl.useMutation();

  const execute = async (wrapSingleColumn: boolean): Promise<boolean> => {
    const { csvFile, projectId, datasetId, input, expectedOutput, metadata } =
      options;

    if (!csvFile) return false;
    if (csvFile.size > MAX_FILE_SIZE_BYTES) {
      showErrorToast("File too large", "Maximum file size is 10MB");
      return false;
    }

    setValidationErrors([]);

    let processedCount = 0;
    let headerMap: Map<string, number>;

    const parsedItems: ParsedCsvItem[] = [];

    // Prepare mappings based on field type
    const inputMapping =
      input.type === "schema"
        ? Object.fromEntries(
            input.entries.map((entry) => [
              entry.key,
              entry.columns.map((c) => c.name),
            ]),
          )
        : undefined;

    const inputColumns =
      input.type === "freeform" ? input.columns.map((c) => c.name) : [];

    const expectedOutputMapping =
      expectedOutput.type === "schema"
        ? Object.fromEntries(
            expectedOutput.entries.map((entry) => [
              entry.key,
              entry.columns.map((c) => c.name),
            ]),
          )
        : undefined;

    const expectedOutputColumns =
      expectedOutput.type === "freeform"
        ? expectedOutput.columns.map((c) => c.name)
        : [];

    const metadataColumns = metadata.map((c) => c.name);

    try {
      await parseCsvClient(csvFile, {
        processor: {
          onHeader: (headers) => {
            headerMap = new Map(headers.map((h, i) => [h, i]));

            // Validate columns exist
            const allColumns = [
              ...Object.values(inputMapping ?? {}).flat(),
              ...Object.values(expectedOutputMapping ?? {}).flat(),
              ...inputColumns,
              ...expectedOutputColumns,
              ...metadataColumns,
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
              let itemInput: unknown;
              let itemExpected: unknown;

              // Process input
              if (input.type === "schema" && inputMapping) {
                itemInput = buildSchemaObject(inputMapping, row, headerMap);
              } else {
                itemInput =
                  parseColumns(inputColumns, row, headerMap, {
                    wrapSingleColumn,
                  }) ?? undefined;
              }

              // Process expected output
              if (expectedOutput.type === "schema" && expectedOutputMapping) {
                itemExpected = buildSchemaObject(
                  expectedOutputMapping,
                  row,
                  headerMap,
                );
              } else {
                itemExpected =
                  parseColumns(expectedOutputColumns, row, headerMap, {
                    wrapSingleColumn,
                  }) ?? undefined;
              }

              const itemMetadata =
                parseColumns(metadataColumns, row, headerMap, {
                  wrapSingleColumn,
                }) ?? undefined;

              parsedItems.push({
                id: safeRandomUUID(),
                datasetId,
                input: itemInput,
                expectedOutput: itemExpected,
                metadata: itemMetadata,
              });
            } catch (error) {
              throw new Error(
                `Error processing row ${index + 1}: ${error instanceof Error ? error.message : "Unknown error"}`,
              );
            }
          },
        },
      });

      setProgress({
        totalItems: parsedItems.length,
        processedItems: 0,
        status: "processing",
      });

      const urlCache = new Map<string, Promise<string>>();

      const items: RouterInputs["datasets"]["createManyDatasetItems"]["items"] =
        [];

      for (const parsed of parsedItems) {
        const convertUrl = (url: string, field: DatasetItemMediaField) => {
          let pending = urlCache.get(url);
          if (!pending) {
            pending = ingestItemMediaFromUrl
              .mutateAsync({
                projectId,
                datasetId,
                datasetItemId: parsed.id,
                field,
                url,
              })
              .then((result) => result.referenceString);
            urlCache.set(url, pending);
          }
          return pending;
        };

        items.push({
          id: parsed.id,
          datasetId,
          input: JSON.stringify(
            await rewriteCsvFieldMedia(parsed.input, "input", convertUrl),
          ),
          expectedOutput: JSON.stringify(
            await rewriteCsvFieldMedia(
              parsed.expectedOutput,
              "expectedOutput",
              convertUrl,
            ),
          ),
          metadata: JSON.stringify(
            await rewriteCsvFieldMedia(parsed.metadata, "metadata", convertUrl),
          ),
        });
      }

      const optimalChunkSize = getOptimalChunkSize(items, CHUNK_START_SIZE);
      const chunks = chunk(items, optimalChunkSize);

      for (const [index, chunkItems] of chunks.entries()) {
        const result = await mutCreateManyDatasetItems.mutateAsync({
          projectId,
          items: chunkItems,
        });

        if (!result.success) {
          const adjustedErrors = result.validationErrors.map((error) => ({
            ...error,
            itemIndex: error.itemIndex + processedCount,
          }));

          setValidationErrors(adjustedErrors);
          setProgress({
            totalItems: 0,
            processedItems: 0,
            status: "not-started",
          });
          return false;
        }

        processedCount += chunkItems.length;
        setProgress({
          totalItems: items.length,
          processedItems: processedCount,
          status: "processing",
        });

        if (index < chunks.length - 1) {
          await sleep(DELAY_BETWEEN_CHUNKS);
        }
      }
    } catch (error) {
      utils.datasets.invalidate();
      setProgress({
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
      return false;
    }

    utils.datasets.invalidate();

    setProgress({
      totalItems: parsedItems.length,
      processedItems: parsedItems.length,
      status: "complete",
    });

    return true;
  };

  const reset = () => {
    setProgress({
      totalItems: 0,
      processedItems: 0,
      status: "not-started",
    });
    setValidationErrors([]);
  };

  return {
    execute,
    progress,
    validationErrors,
    reset,
  };
}
