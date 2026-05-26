import type { McpFeatureModule } from "../../server/registry";
import { createDatasetTool, handleCreateDataset } from "./tools/createDataset";
import {
  createDatasetItemTool,
  handleCreateDatasetItem,
} from "./tools/createDatasetItem";
import {
  createDatasetRunItemTool,
  handleCreateDatasetRunItem,
} from "./tools/createDatasetRunItem";
import {
  deleteDatasetItemTool,
  handleDeleteDatasetItem,
} from "./tools/deleteDatasetItem";
import {
  deleteDatasetRunTool,
  handleDeleteDatasetRun,
} from "./tools/deleteDatasetRun";
import { getDatasetTool, handleGetDataset } from "./tools/getDataset";
import {
  getDatasetItemTool,
  handleGetDatasetItem,
} from "./tools/getDatasetItem";
import { getDatasetRunTool, handleGetDatasetRun } from "./tools/getDatasetRun";
import {
  handleListDatasetItems,
  listDatasetItemsTool,
} from "./tools/listDatasetItems";
import {
  handleListDatasetRunItems,
  listDatasetRunItemsTool,
} from "./tools/listDatasetRunItems";
import {
  handleListDatasetRuns,
  listDatasetRunsTool,
} from "./tools/listDatasetRuns";
import { handleListDatasets, listDatasetsTool } from "./tools/listDatasets";

export const datasetsFeature: McpFeatureModule = {
  name: "datasets",
  description:
    "Manage datasets, named collections of dataset items for experiments and evaluations, plus runs and run items",
  tools: [
    { definition: createDatasetTool, handler: handleCreateDataset },
    {
      definition: listDatasetsTool,
      handler: handleListDatasets,
      allowInAppAgentKey: true,
    },
    {
      definition: getDatasetTool,
      handler: handleGetDataset,
      allowInAppAgentKey: true,
    },
    { definition: createDatasetItemTool, handler: handleCreateDatasetItem },
    {
      definition: listDatasetItemsTool,
      handler: handleListDatasetItems,
      allowInAppAgentKey: true,
    },
    {
      definition: getDatasetItemTool,
      handler: handleGetDatasetItem,
      allowInAppAgentKey: true,
    },
    { definition: deleteDatasetItemTool, handler: handleDeleteDatasetItem },
    {
      definition: createDatasetRunItemTool,
      handler: handleCreateDatasetRunItem,
    },
    {
      definition: listDatasetRunItemsTool,
      handler: handleListDatasetRunItems,
      allowInAppAgentKey: true,
    },
    {
      definition: listDatasetRunsTool,
      handler: handleListDatasetRuns,
      allowInAppAgentKey: true,
    },
    {
      definition: getDatasetRunTool,
      handler: handleGetDatasetRun,
      allowInAppAgentKey: true,
    },
    { definition: deleteDatasetRunTool, handler: handleDeleteDatasetRun },
  ],
};
