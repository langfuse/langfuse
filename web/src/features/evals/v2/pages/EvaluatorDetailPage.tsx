import { useRouter } from "next/router";
import { Skeleton } from "@/src/components/ui/skeleton";
import { api } from "@/src/utils/api";
import type { NormalizedEvaluatorDefinition } from "../server/evaluators/evaluatorTypes";
import { EvaluatorSetupPage } from "./EvaluatorSetupPage";

export default function EvaluatorDetailPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const evaluatorId = router.query.evaluatorId as string;
  const evaluator = api.evalsV2.get.useQuery(
    { projectId, evaluatorId },
    { enabled: Boolean(projectId && evaluatorId) },
  );

  if (evaluator.isPending) {
    return <Skeleton className="m-6 h-96 w-[calc(100%-3rem)]" />;
  }
  if (!evaluator.data?.versions[0]) {
    return <div className="p-6">Evaluator not found</div>;
  }

  const latest = evaluator.data.versions[0];
  const definition =
    evaluator.data.type === "LLM_AS_JUDGE"
      ? {
          type: "LLM_AS_JUDGE" as const,
          promptMessages: latest.promptMessages!,
          provider: latest.provider,
          model: latest.model,
          modelParams: latest.modelParams,
          vars: latest.vars,
          variableMapping: latest.variableMapping,
          outputDefinition: latest.outputDefinition,
        }
      : {
          type: "CODE" as const,
          sourceCode: latest.sourceCode ?? "",
          sourceCodeLanguage: latest.sourceCodeLanguage ?? "TYPESCRIPT",
        };

  return (
    <EvaluatorSetupPage
      mode="edit"
      key={`${evaluator.data.id}-${latest.id}`}
      projectId={projectId}
      initialEvaluator={{
        id: evaluator.data.id,
        name: evaluator.data.name,
        description: evaluator.data.description,
        type: evaluator.data.type,
        definition: definition as NormalizedEvaluatorDefinition,
        blockedAt: evaluator.data.blockedAt,
        blockReason: evaluator.data.blockReason,
        blockMessage: evaluator.data.blockMessage,
        sampleFilter: evaluator.data.sampleFilter,
      }}
    />
  );
}
