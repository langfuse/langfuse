import Header from "@/src/components/layouts/header";
import { EvalTemplateForm } from "@/src/ee/features/evals/components/template-form";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";

import { useRouter } from "next/router";

export default function NewTemplatesPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const hasAccess = useHasAccess({ projectId, scope: "evalTemplate:read" });

  if (!hasAccess) {
    return null;
  }

  return (
    <div className="md:container">
      <Header
        title="Create eval template"
        help={{
          description:
            "Create an evaluation template. Choose from one of the pre-defined templates or create your own.",
          href: "https://langfuse.com/docs/scores/model-based-evals",
        }}
      />
      <EvalTemplateForm projectId={projectId} isEditing={true} />
    </div>
  );
}
