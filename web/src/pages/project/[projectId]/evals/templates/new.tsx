import Header from "@/src/components/layouts/header";
import { EvalTemplateForm } from "@/src/features/evals/components/template-form";
import { PlaygroundProvider } from "@/src/features/playground/client/context";
import { evalLLMModels } from "@langfuse/shared";

import { useRouter } from "next/router";

export default function NewTemplatesPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="md:container">
      <Header title="Create eval template" />
      <PlaygroundProvider avilableModels={[...evalLLMModels]}>
        <EvalTemplateForm projectId={projectId} isEditing={true} />
      </PlaygroundProvider>
    </div>
  );
}
