import type { McpFeatureModule } from "../../server/registry";
import { getScoreTool, handleGetScore } from "./tools/getScore";
import {
  getScoreConfigTool,
  handleGetScoreConfig,
} from "./tools/getScoreConfig";
import { listScoresTool, handleListScores } from "./tools/listScores";
import {
  listScoreConfigsTool,
  handleListScoreConfigs,
} from "./tools/listScoreConfigs";
import {
  createScoreConfigTool,
  handleCreateScoreConfig,
} from "./tools/createScoreConfig";
import { createScoreTool, handleCreateScore } from "./tools/createScore";
import { deleteScoreTool, handleDeleteScore } from "./tools/deleteScore";
import {
  deleteScoreConfigTool,
  handleDeleteScoreConfig,
} from "./tools/deleteScoreConfig";
import {
  updateScoreConfigTool,
  handleUpdateScoreConfig,
} from "./tools/updateScoreConfig";

export const scoresFeature: McpFeatureModule = {
  name: "scores",
  description:
    "Read scores and manage score configurations in the current Langfuse project",
  tools: [
    {
      definition: listScoresTool,
      handler: handleListScores,
    },
    {
      definition: getScoreTool,
      handler: handleGetScore,
    },
    {
      definition: createScoreTool,
      handler: handleCreateScore,
    },
    {
      definition: deleteScoreTool,
      handler: handleDeleteScore,
    },
    {
      definition: listScoreConfigsTool,
      handler: handleListScoreConfigs,
    },
    {
      definition: getScoreConfigTool,
      handler: handleGetScoreConfig,
    },
    {
      definition: createScoreConfigTool,
      handler: handleCreateScoreConfig,
    },
    {
      definition: updateScoreConfigTool,
      handler: handleUpdateScoreConfig,
    },
    {
      definition: deleteScoreConfigTool,
      handler: handleDeleteScoreConfig,
    },
  ],
};
