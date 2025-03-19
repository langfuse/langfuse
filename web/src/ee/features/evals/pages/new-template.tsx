import Page from "@/src/components/layouts/page";
import { EvalTemplateForm } from "@/src/ee/features/evals/components/template-form";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useRouter } from "next/router";

export default function NewTemplatesPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "evalTemplate:read",
  });

  if (!hasAccess) {
    return null;
  }

  return (
    <Page
      withPadding
      scrollable
      headerProps={{
        title: "Create eval template",
        help: {
          description:
            "Create an evaluation template. Choose from one of the pre-defined templates or create your own.",
          href: "https://langfuse.com/docs/scores/model-based-evals",
        },
      }}
    >
      <EvalTemplateForm projectId={projectId} isEditing={true} />
    </Page>
  );
}
