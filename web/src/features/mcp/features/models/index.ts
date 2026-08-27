import type { McpFeatureModule } from "../../server/registry";
import { createModelTool, handleCreateModel } from "./tools/createModel";
import { deleteModelTool, handleDeleteModel } from "./tools/deleteModel";
import { getModelTool, handleGetModel } from "./tools/getModel";
import { handleListModels, listModelsTool } from "./tools/listModels";

export const modelsFeature = {
  name: "models",
  description: "Manage model definitions",
  tools: [
    {
      definition: listModelsTool,
      handler: handleListModels,
    },
    { definition: createModelTool, handler: handleCreateModel },
    {
      definition: getModelTool,
      handler: handleGetModel,
    },
    { definition: deleteModelTool, handler: handleDeleteModel },
  ],
} as const satisfies McpFeatureModule;
