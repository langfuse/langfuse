import { useRouter } from "next/router";
import { EvalTemplateTypeEnum } from "@langfuse/shared";

import { Skeleton } from "@/src/components/ui/skeleton";
import { useEvalTemplate } from "@/src/features/evals/v2/hooks/useEvalTemplate";
import { EvaluatorSetupPage } from "./EvaluatorSetupPage";

function requestedEvaluatorType(value: string | string[] | undefined) {
  return value === EvalTemplateTypeEnum.CODE
    ? EvalTemplateTypeEnum.CODE
    : EvalTemplateTypeEnum.LLM_AS_JUDGE;
}

export default function NewEvaluatorPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const templateKey =
    typeof router.query.template === "string" ? router.query.template : null;
  const evaluatorId =
    typeof router.query.evaluatorId === "string"
      ? router.query.evaluatorId
      : null;
  const template = useEvalTemplate({
    projectId,
    templateKey,
    evaluatorId,
    enabled: router.isReady,
  });

  if (!router.isReady || template.isPending) {
    return <Skeleton className="m-6 h-96 w-[calc(100%-3rem)]" />;
  }

  if (template.isNotFound) {
    return <div className="p-6">Evaluator template not found</div>;
  }

  const initialType = requestedEvaluatorType(router.query.type);
  const creationSource = templateKey
    ? { type: "managed" as const, templateKey }
    : evaluatorId
      ? { type: "custom" as const }
      : { type: "scratch" as const };

  return (
    <EvaluatorSetupPage
      mode="create"
      key={templateKey ?? evaluatorId ?? initialType}
      projectId={projectId}
      initialDraft={template.draft}
      initialType={initialType}
      creationSource={creationSource}
    />
  );
}
