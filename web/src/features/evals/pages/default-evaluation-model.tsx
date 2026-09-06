import Page from "@/src/components/layouts/page";
import { useRouter } from "next/router";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { DefaultEvalModelSetup } from "@/src/features/evals/components/default-eval-model-setup";
import { useTranslations } from "next-intl";

export default function DefaultEvaluationModelPage() {
  const t = useTranslations("evaluationAnalytics.evaluations");
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
        title: t("defaultEvaluationModel"),
        help: {
          description: t("defaultEvaluationModelDescription"),
          href: "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge",
        },
        breadcrumb: [
          {
            name: t("evaluatorLibrary"),
            href: `/project/${projectId}/evals/templates`,
          },
        ],
      }}
    >
      <DefaultEvalModelSetup projectId={projectId} />
    </Page>
  );
}
