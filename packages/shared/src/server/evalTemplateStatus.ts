/**
 * Effective eval template status for a project: OK or ERROR.
 * Single source of truth used by API (when returning templates) and worker (when needed).
 *
 * Formula: ERROR when template.status === 'ERROR' OR (template uses default model AND project has no default model).
 */

export type EvalTemplateStatusInput = {
  status: string;
  provider?: string | null;
  model?: string | null;
};

export type ProjectDefaultModelInput = {
  provider: string;
  model: string;
} | null;

/**
 * Returns the effective status of an eval template for a given project.
 * - Uses default model: template.provider == null && template.model == null.
 * - Returns 'ERROR' if template.status === 'ERROR' or (uses default and project has no default model).
 */
export function getEffectiveEvalTemplateStatus(
  template: EvalTemplateStatusInput,
  projectDefaultModel: ProjectDefaultModelInput,
): "OK" | "ERROR" {
  const usesDefaultModel = template.provider == null && template.model == null;
  if (template.status === "ERROR") {
    return "ERROR";
  }
  if (usesDefaultModel && !projectDefaultModel) {
    return "ERROR";
  }
  return "OK";
}
