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
      allowInAppAgentKey: true,
    },
    {
      definition: getScoreTool,
      handler: handleGetScore,
      allowInAppAgentKey: true,
    },
    {
      definition: createScoreTool,
      handler: handleCreateScore,
    },
    {
      definition: listScoreConfigsTool,
      handler: handleListScoreConfigs,
      allowInAppAgentKey: true,
    },
    {
      definition: getScoreConfigTool,
      handler: handleGetScoreConfig,
      allowInAppAgentKey: true,
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
