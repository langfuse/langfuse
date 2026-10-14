import { type EvalTemplate } from "@langfuse/shared";

export const getEvalTemplateFamilyKey = (
  template: Pick<EvalTemplate, "projectId" | "name" | "type">,
) => `${template.projectId ?? "langfuse"}:${template.type}:${template.name}`;
