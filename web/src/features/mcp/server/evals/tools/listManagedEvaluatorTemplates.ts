import { z } from "zod";
import { EvalTemplateType } from "@langfuse/shared";

import { managedEvaluatorTemplateService } from "@/src/features/evals";
import { defineTool } from "@/src/features/mcp/core/define-tool";
import { runMcpTool } from "@/src/features/mcp/core/run-mcp-tool";

const ListManagedEvaluatorTemplatesInput = z.object({
  search: z.string().trim().max(200).optional(),
  category: z.string().trim().min(1).optional(),
  type: z
    .enum([
      EvalTemplateType.LLM_AS_JUDGE,
      EvalTemplateType.CODE,
      EvalTemplateType.DECISION_MODEL,
    ])
    .optional(),
});

export const [
  listManagedEvaluatorTemplatesTool,
  handleListManagedEvaluatorTemplates,
] = defineTool({
  name: "listManagedEvaluatorTemplates",
  description: [
    "List the evaluator templates maintained by Langfuse and partners.",
    "LLM-as-a-judge and code definitions can be copied into createEvaluator.",
    "For decision-model templates, copy questions, convert each state entry into a variableMapping entry, and provide a TypeSafe modelConfig.",
  ].join(" "),
  action: "evaluator:read",
  baseSchema: ListManagedEvaluatorTemplatesInput,
  inputSchema: ListManagedEvaluatorTemplatesInput,
  handler: (input, context) =>
    runMcpTool({
      spanName: "mcp.evaluator_templates.list_managed",
      context,
      attributes: {
        "mcp.evaluator_template_category": input.category,
        "mcp.evaluator_template_type": input.type,
      },
      fn: async () => managedEvaluatorTemplateService.list(input),
    }),
  readOnlyHint: true,
});
