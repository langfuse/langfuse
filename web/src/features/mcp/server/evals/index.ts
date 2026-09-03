import type { McpFeatureModule } from "../registry";
import {
  listEvaluatorsTool,
  handleListEvaluators,
} from "./tools/listEvaluators";
import { getEvaluatorTool, handleGetEvaluator } from "./tools/getEvaluator";
import {
  createEvaluatorTool,
  handleCreateEvaluator,
} from "./tools/createEvaluator";
import {
  updateEvaluatorTool,
  handleUpdateEvaluator,
} from "./tools/updateEvaluator";
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
import {
  handleListManagedEvaluatorTemplates,
  listManagedEvaluatorTemplatesTool,
} from "./tools/listManagedEvaluatorTemplates";
import {
  attachEvaluatorToEvaluationRuleTool,
  detachEvaluatorFromEvaluationRuleTool,
  handleAttachEvaluatorToEvaluationRule,
  handleDetachEvaluatorFromEvaluationRule,
} from "./tools/manageEvaluationRuleEvaluators";
import { handleTestEvaluator, testEvaluatorTool } from "./tools/testEvaluator";

export const evalsFeature = {
  name: "evals",
  description:
    "Manage evaluators and evaluation rules in the current Langfuse project",
  tools: [
    {
      definition: listManagedEvaluatorTemplatesTool,
      handler: handleListManagedEvaluatorTemplates,
    },
    {
      definition: listEvaluatorsTool,
      handler: handleListEvaluators,
    },
    {
      definition: getEvaluatorTool,
      handler: handleGetEvaluator,
    },
    {
      definition: testEvaluatorTool,
      handler: handleTestEvaluator,
    },
    { definition: createEvaluatorTool, handler: handleCreateEvaluator },
    { definition: updateEvaluatorTool, handler: handleUpdateEvaluator },
    {
      definition: deleteEvaluatorTool,
      handler: handleDeleteEvaluator,
    },
    {
      definition: listEvaluationRulesTool,
      handler: handleListEvaluationRules,
    },
    {
      definition: getEvaluationRuleTool,
      handler: handleGetEvaluationRule,
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
      definition: attachEvaluatorToEvaluationRuleTool,
      handler: handleAttachEvaluatorToEvaluationRule,
    },
    {
      definition: detachEvaluatorFromEvaluationRuleTool,
      handler: handleDetachEvaluatorFromEvaluationRule,
    },
    {
      definition: deleteEvaluationRuleTool,
      handler: handleDeleteEvaluationRule,
    },
  ],
} as const satisfies McpFeatureModule;
