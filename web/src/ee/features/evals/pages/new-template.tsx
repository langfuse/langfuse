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
      <Header title="Create eval template" />
      <EvalTemplateForm projectId={projectId} isEditing={true} />
    </div>
  );
}
