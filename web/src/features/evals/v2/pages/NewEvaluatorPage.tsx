import { useRouter } from "next/router";
import { useState, useSyncExternalStore } from "react";
import { EvalTemplateTypeEnum } from "@langfuse/shared";

import { Skeleton } from "@/src/components/ui/skeleton";
import { useEvalTemplate } from "@/src/features/evals/v2/hooks/useEvalTemplate";
import { agentEvaluatorDraftToSetupDraft } from "@/src/features/evals/v2/fns/evaluators/agentEvaluatorDraft";
import { takeAgentEvaluatorDraft } from "@/src/features/in-app-agent/lib/evaluatorDraftStorage";
import { EvaluatorSetupPage } from "./EvaluatorSetupPage";

function requestedEvaluatorType(value: string | string[] | undefined) {
  return value === EvalTemplateTypeEnum.CODE
    ? EvalTemplateTypeEnum.CODE
    : EvalTemplateTypeEnum.LLM_AS_JUDGE;
}

const subscribeNever = () => () => undefined;

export default function NewEvaluatorPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const isAgentDraft = router.query.agentDraft === "1";
  const isClient = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
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
    enabled: router.isReady && !isAgentDraft,
  });

  if (!router.isReady || (isAgentDraft && !isClient) || template.isPending) {
    return <Skeleton className="m-6 h-96 w-[calc(100%-3rem)]" />;
  }

  if (isAgentDraft) {
    return <AssistantEvaluatorDraftPage projectId={projectId} />;
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

function AssistantEvaluatorDraftPage({ projectId }: { projectId: string }) {
  const [draft] = useState(() => takeAgentEvaluatorDraft(projectId));

  if (!draft) {
    return (
      <div className="p-6">
        This assistant draft is no longer available. Ask the assistant to
        propose the evaluator again.
      </div>
    );
  }

  return (
    <EvaluatorSetupPage
      mode="create"
      key="assistant-draft"
      projectId={projectId}
      initialDraft={agentEvaluatorDraftToSetupDraft(draft)}
      initialType={EvalTemplateTypeEnum.LLM_AS_JUDGE}
      creationSource={{ type: "assistant" }}
    />
  );
}
