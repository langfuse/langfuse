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

  return (
    <Page
      withPadding
      scrollable
      headerProps={{
        title: "Create evaluator",
        help: {
          description:
            "Select a template defining the evaluation prompt and a model as judge to evaluate incoming traces.",
          href: "https://langfuse.com/docs/scores/model-based-evals",
        },
      }}
    >
      <EvaluatorForm
        projectId={projectId}
        evalTemplates={evalTemplates.data?.templates ?? []}
      />
    </Page>
  );
}
