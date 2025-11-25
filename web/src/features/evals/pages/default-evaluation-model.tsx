import Page from "@/src/components/layouts/page";
import { useRouter } from "next/router";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { DefaultEvalModelSetup } from "@/src/features/evals/components/default-eval-model-setup";

export default function DefaultEvaluationModelPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalDefaultModel:read",
  });

  if (!hasReadAccess) {
    return <SupportOrUpgradePage />;
  }

  return (
    <Page
      withPadding
      headerProps={{
        title: "Default Evaluation Model",
        help: {
          description: "Configure a default evaluation model for your project.",
          href: "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge",
        },
        breadcrumb: [
          {
            name: "Evaluator Library",
            href: `/project/${projectId}/evals/templates`,
          },
        ],
      }}
    >
      <DefaultEvalModelSetup projectId={projectId} />
    </Page>
  );
}
