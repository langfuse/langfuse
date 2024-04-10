import Header from "@/src/components/layouts/header";
import { EvalTemplateForm } from "@/src/features/evals/components/new-template-form";
import { PlaygroundProvider } from "@/src/features/playground/client/context";
import { api } from "@/src/utils/api";
import { evalModels } from "@langfuse/shared";

import { useRouter } from "next/router";

export default function NewTemplatesPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="md:container">
      <Header
        title="Create eval template"
        help={{
          description:
            "A scores is an evaluation of a traces or observations. It can be created from user feedback, model-based evaluations, or manual review. See docs to learn more.",
          href: "https://langfuse.com/docs/scores",
        }}
      />
      <PlaygroundProvider avilableModels={[...evalModels]}>
        <EvalTemplateForm projectId={projectId} />
      </PlaygroundProvider>
    </div>
  );
}
