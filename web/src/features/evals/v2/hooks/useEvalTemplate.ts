import { evaluatorToEvaluatorSetupDraft } from "@/src/features/evals/v2/fns/templateGallery/evaluatorToEvaluatorSetupDraft";
import { managedEvaluatorTemplateService } from "@/src/features/evals/v2/fns/templateGallery/managedEvaluatorTemplateService";
import { managedTemplateToEvaluatorSetupDraft } from "@/src/features/evals/v2/fns/templateGallery/managedTemplateToEvaluatorSetupDraft";
import { api } from "@/src/utils/api";

export function useEvalTemplate({
  projectId,
  templateKey,
  evaluatorId,
  enabled,
}: {
  projectId: string;
  templateKey: string | null;
  evaluatorId: string | null;
  enabled: boolean;
}) {
  const projectEvaluator = api.evalsV2.get.useQuery(
    { projectId, evaluatorId: evaluatorId ?? "" },
    { enabled: enabled && Boolean(projectId && evaluatorId) },
  );
  const managedTemplate = templateKey
    ? managedEvaluatorTemplateService.get(templateKey)
    : null;
  const draft = managedTemplate
    ? managedTemplateToEvaluatorSetupDraft(managedTemplate)
    : projectEvaluator.data
      ? evaluatorToEvaluatorSetupDraft(projectEvaluator.data)
      : null;

  return {
    draft:
      evaluatorId && draft ? { ...draft, name: `${draft.name} copy` } : draft,
    isPending: Boolean(evaluatorId && projectEvaluator.isPending),
    isNotFound: Boolean(
      (templateKey && !managedTemplate) ||
      (evaluatorId && (!projectEvaluator.data || !draft)),
    ),
  };
}
