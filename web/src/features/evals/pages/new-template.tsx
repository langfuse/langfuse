import Page from "@/src/components/layouts/page";
import { EvalTemplateForm } from "@/src/features/evals/components/template-form";
import { useHasProjectAccess } from "@/src/features/rbac";
import { useRouter } from "next/router";

export default function NewTemplatesPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "evaluator:CUD",
  });

  if (!hasAccess) {
    return <div>You do not have access to this page.</div>;
  }

  return (
    <Page
      withPadding
      scrollable
      headerProps={{
        title: "Create custom evaluator",
        breadcrumb: [
          {
            name: "Evaluators",
            href: `/project/${projectId}/evals/templates`,
          },
        ],
      }}
    >
      <EvalTemplateForm
        projectId={projectId}
        isEditing={true}
        useDialog={false}
      />
    </Page>
  );
}
