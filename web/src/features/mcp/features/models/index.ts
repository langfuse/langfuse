import type { McpFeatureModule } from "../../server/registry";
import {
  createModelTool,
  deleteModelTool,
  getModelTool,
  handleCreateModel,
  handleDeleteModel,
  handleGetModel,
  handleListModels,
  listModelsTool,
} from "./tools";

export const modelsFeature: McpFeatureModule = {
  name: "models",
  description: "Manage model definitions",
  tools: [
    {
      definition: listModelsTool,
      handler: handleListModels,
      allowInAppAgentKey: true,
    },
    { definition: createModelTool, handler: handleCreateModel },
    {
      definition: getModelTool,
      handler: handleGetModel,
      allowInAppAgentKey: true,
    },
    { definition: deleteModelTool, handler: handleDeleteModel },
  ],
};
