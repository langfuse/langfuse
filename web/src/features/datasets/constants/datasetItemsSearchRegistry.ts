import { datasetItemFilterColumns } from "@langfuse/shared";
import { fieldRegistryFromColumns } from "@/src/features/search-bar";

export const DATASET_ITEMS_FIELD_REGISTRY = fieldRegistryFromColumns(
  datasetItemFilterColumns,
  {
    id: "datasetItems",
    allowFreeText: true,
    defaultSearchType: ["id"],
    freeTextScopeLabel: "item IDs",
    metadata: true,
    // Postgres JSON metadata: a numeric cast fails on any non-numeric value.
    filterStateErrors: (filters) =>
      filters.some(
        (filter) =>
          filter.column === "metadata" && filter.type === "numberObject",
      )
        ? [
            "Dataset item metadata supports text matches only. Use metadata.key:value or metadata.key:~value.",
          ]
        : [],
    scores: false,
    traceScores: false,
    searchExamples: [
      "item ID",
      'content:"refund policy"',
      "metadata.region:eu",
    ],
    searchScopes: {
      content: {
        searchType: ["content"],
        label: "Content",
        description: "search input, expected output, and metadata",
      },
      input: {
        searchType: ["input"],
        label: "Input",
        description: "search input only",
      },
      output: {
        searchType: ["output"],
        label: "Expected output",
        description: "search expected output only",
      },
      all: {
        searchType: ["id", "content"],
        label: "All fields",
        description: "search item IDs, input, expected output, and metadata",
      },
    },
  },
);
