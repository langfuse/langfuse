import Header from "@/src/components/layouts/header";
import { EvalTemplateForm } from "@/src/features/evals/components/template-form";

import { useRouter } from "next/router";

export default function NewTemplatesPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="md:container">
      <Header title="Create eval template" />
      <EvalTemplateForm projectId={projectId} isEditing={true} />
    </div>
  );
}
