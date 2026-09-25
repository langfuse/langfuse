import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { PriceUnit } from "@/src/features/models/validation";
import {
  ModelDefinitionsTable,
  type ModelTableRow,
} from "./ModelDefinitionsTable";

const meta = preview.meta({ component: ModelDefinitionsTable });

const model: ModelTableRow = {
  modelId: "model-1",
  maintainer: "Langfuse",
  modelName: "example-model",
  matchPattern: "^example-model$",
  prices: { input: 0.000001, output: 0.000002 },
  tokenizerId: "openai",
  config: null,
  serverResponse: {
    id: "model-1",
    projectId: null,
    modelName: "example-model",
    matchPattern: "^example-model$",
    tokenizerId: "openai",
    tokenizerConfig: null,
    pricingTiers: [],
  },
};

export const Default = meta.story({
  args: {
    data: {
      status: "success",
      data: [
        model,
        {
          ...model,
          modelId: "model-2",
          modelName: "custom-model",
          maintainer: "User",
          serverResponse: {
            ...model.serverResponse,
            id: "model-2",
            projectId: "project-1",
          },
        },
      ],
    },
    pagination: {
      totalCount: 2,
      state: { pageIndex: 0, pageSize: 50 },
      onChange: fn(),
    },
    search: { value: "", onChange: fn() },
    rowHeight: "m",
    onRowHeightChange: fn(),
    priceUnit: PriceUnit.PerUnit,
    priceUnitMultiplier: 1,
    lastUsed: { "model-1": new Date("2026-09-01") },
    toolbarActions: [
      { id: "add-model", label: "Add Model Definition", onClick: fn() },
    ],
    modelActions: {
      canEdit: true,
      onClone: fn(),
      onEdit: fn(),
      onDelete: fn(),
    },
    onRowClick: fn(),
  },
});

export const Loading = meta.story({
  args: { ...Default.input.args, data: { status: "loading" } },
});
