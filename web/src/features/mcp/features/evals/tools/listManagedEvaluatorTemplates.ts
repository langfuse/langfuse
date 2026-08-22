import { z } from "zod";

import { managedEvaluatorTemplateService } from "@/src/features/evals";
import { defineTool } from "@/src/features/mcp/core/define-tool";
import { runMcpTool } from "@/src/features/mcp/core/run-mcp-tool";

const ListManagedEvaluatorTemplatesInput = z.object({
  search: z.string().trim().max(200).optional(),
  category: z.string().trim().min(1).optional(),
  type: z.enum(["LLM_AS_JUDGE", "CODE"]).optional(),
});

export const [
  listManagedEvaluatorTemplatesTool,
  handleListManagedEvaluatorTemplates,
] = defineTool({
  name: "listManagedEvaluatorTemplates",
  description:
    "List the evaluator templates maintained by Langfuse and partners. Copy a returned definition into createEvaluator to create a project evaluator.",
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
