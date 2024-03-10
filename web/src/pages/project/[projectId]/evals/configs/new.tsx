import Header from "@/src/components/layouts/header";
import { NewEvalConfigForm } from "@/src/features/evals/components/new-eval-config-form";

import { useRouter } from "next/router";

export default function TemplatesPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div>
      <Header
        title="Create eval config"
        help={{
          description:
            "A scores is an evaluation of a traces or observations. It can be created from user feedback, model-based evaluations, or manual review. See docs to learn more.",
          href: "https://langfuse.com/docs/scores",
        }}
      />
      <NewEvalConfigForm projectId={projectId} />
    </div>
  );
}
