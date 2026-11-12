import { datasetItemFilterColumns } from "@langfuse/shared";
import { fieldRegistryFromColumns } from "@/src/features/search-bar/lib/fields";

export const DATASET_ITEMS_FIELD_REGISTRY = fieldRegistryFromColumns(
  datasetItemFilterColumns,
  {
    id: "datasetItems",
    allowFreeText: true,
    defaultSearchType: ["id"],
    freeTextScopeLabel: "item IDs",
    metadata: true,
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
