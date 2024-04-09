import Header from "@/src/components/layouts/header";
import { NewEvalTemplateForm } from "@/src/features/evals/components/new-template-form";
import { PlaygroundProvider } from "@/src/features/playground/client/context";
import { api } from "@/src/utils/api";
import { evalModels } from "@langfuse/shared";

import { useRouter } from "next/router";

export default function TemplatesPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const evals = api.evals.allTemplates.useQuery({
    projectId: projectId,
    limit: 500,
    page: 0,
  });

  return (
    <div>
      <Header
        title="Create eval template"
        help={{
          description:
            "A scores is an evaluation of a traces or observations. It can be created from user feedback, model-based evaluations, or manual review. See docs to learn more.",
          href: "https://langfuse.com/docs/scores",
        }}
      />
      <PlaygroundProvider avilableModels={[...evalModels]}>
        <NewEvalTemplateForm
          projectId={projectId}
          existingEvalTemplates={evals.data?.templates ?? []}
        />
      </PlaygroundProvider>
    </div>
  );
}
