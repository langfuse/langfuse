import type { McpFeatureModule } from "../../server/registry";
import { createModelTool, handleCreateModel } from "./tools/createModel";
import { deleteModelTool, handleDeleteModel } from "./tools/deleteModel";
import { getModelTool, handleGetModel } from "./tools/getModel";
import { handleListModels, listModelsTool } from "./tools/listModels";

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
