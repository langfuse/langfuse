import type { McpFeatureModule } from "../../server/registry";
import {
  listEvaluatorsTool,
  handleListEvaluators,
} from "./tools/listEvaluators";
import { getEvaluatorTool, handleGetEvaluator } from "./tools/getEvaluator";
import {
  upsertEvaluatorTool,
  handleUpsertEvaluator,
} from "./tools/upsertEvaluator";
import {
  deleteEvaluatorTool,
  handleDeleteEvaluator,
} from "./tools/deleteEvaluator";
import {
  listEvaluationRulesTool,
  handleListEvaluationRules,
} from "./tools/listEvaluationRules";
import {
  getEvaluationRuleTool,
  handleGetEvaluationRule,
} from "./tools/getEvaluationRule";
import {
  createEvaluationRuleTool,
  handleCreateEvaluationRule,
} from "./tools/createEvaluationRule";
import {
  updateEvaluationRuleTool,
  handleUpdateEvaluationRule,
} from "./tools/updateEvaluationRule";
import {
  deleteEvaluationRuleTool,
  handleDeleteEvaluationRule,
} from "./tools/deleteEvaluationRule";

export const evalsFeature: McpFeatureModule = {
  name: "evals",
  description:
    "Manage evaluators and evaluation rules in the current Langfuse project (unstable API)",
  tools: [
    {
      definition: listEvaluatorsTool,
      handler: handleListEvaluators,
      allowInAppAgentKey: true,
    },
    {
      definition: getEvaluatorTool,
      handler: handleGetEvaluator,
      allowInAppAgentKey: true,
    },
    { definition: upsertEvaluatorTool, handler: handleUpsertEvaluator },
    {
      definition: deleteEvaluatorTool,
      handler: handleDeleteEvaluator,
    },
    {
      definition: listEvaluationRulesTool,
      handler: handleListEvaluationRules,
      allowInAppAgentKey: true,
    },
    {
      definition: getEvaluationRuleTool,
      handler: handleGetEvaluationRule,
      allowInAppAgentKey: true,
    },
    {
      definition: createEvaluationRuleTool,
      handler: handleCreateEvaluationRule,
    },
    {
      definition: updateEvaluationRuleTool,
      handler: handleUpdateEvaluationRule,
    },
    {
      definition: deleteEvaluationRuleTool,
      handler: handleDeleteEvaluationRule,
    },
  ],
};
