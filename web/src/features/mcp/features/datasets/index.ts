import type { McpFeatureModule } from "../../server/registry";
import {
  createDatasetItemTool,
  createDatasetRunItemTool,
  createDatasetTool,
  deleteDatasetItemTool,
  deleteDatasetRunTool,
  getDatasetItemTool,
  getDatasetRunTool,
  getDatasetTool,
  handleCreateDataset,
  handleCreateDatasetItem,
  handleCreateDatasetRunItem,
  handleDeleteDatasetItem,
  handleDeleteDatasetRun,
  handleGetDataset,
  handleGetDatasetItem,
  handleGetDatasetRun,
  handleListDatasetItems,
  handleListDatasetRunItems,
  handleListDatasetRuns,
  handleListDatasets,
  listDatasetItemsTool,
  listDatasetRunItemsTool,
  listDatasetRunsTool,
  listDatasetsTool,
} from "./tools";

export const datasetsFeature: McpFeatureModule = {
  name: "datasets",
  description:
    "Manage datasets, which are reusable collections of input and expected-output examples for experiments and evaluations, plus items and runs",
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
