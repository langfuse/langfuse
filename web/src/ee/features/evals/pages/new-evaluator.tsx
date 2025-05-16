import Page from "@/src/components/layouts/page";
import { EvaluatorForm } from "@/src/ee/features/evals/components/evaluator-form";
import { api } from "@/src/utils/api";

import { useRouter } from "next/router";

export default function NewEvaluatorPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const evalTemplates = api.evals.allTemplates.useQuery({
    projectId,
    limit: 500,
    page: 0,
  });

  const { evaluator } = router.query;

  const currentTemplate = evalTemplates.data?.templates.find(
    (t) => t.id === evaluator,
  );

  return (
    <Page
      withPadding
      scrollable
      headerProps={{
        title:
          "Set up online evaluator" +
          (currentTemplate?.name ? `: ${currentTemplate.name}` : "") +
          (currentTemplate?.projectId === null
            ? " (Langfuse maintained)"
            : " (User maintained)"),
        breadcrumb: [
          {
            name: "Running Evaluators",
            href: `/project/${projectId}/evals`,
          },
        ],
      }}
    >
      <EvaluatorForm
        projectId={projectId}
        evalTemplates={evalTemplates.data?.templates ?? []}
        templateId={evaluator as string}
      />
    </Page>
  );
}
