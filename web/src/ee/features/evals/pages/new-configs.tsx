import Header from "@/src/components/layouts/header";
import { EvalConfigForm } from "@/src/ee/features/evals/components/eval-config-form";
import { api } from "@/src/utils/api";

import { useRouter } from "next/router";

export default function NewConfigsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const evalTemplates = api.evals.allTemplates.useQuery({
    projectId,
    limit: 500,
    page: 0,
  });

  return (
    <div>
      <Header
        title="Set up new evaluation job"
        help={{
          description:
            "Evaluation jobs let you define how your evaluation templates are applied to incoming traces in Langfuse.",
          href: "https://langfuse.com/docs/scores/model-based-evals",
        }}
      />
      <EvalConfigForm
        projectId={projectId}
        evalTemplates={evalTemplates.data?.templates ?? []}
      />
    </div>
  );
}
