import Page from "@/src/components/layouts/page";
import { EvalTemplateForm } from "@/src/features/evals/components/template-form";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";

export default function NewTemplatesPage() {
  const t = useTranslations("evaluationAnalytics.evaluations");
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "evaluator:CUD",
  });

  if (!hasAccess) {
    return null;
  }

  return (
    <Page
      withPadding
      scrollable
      headerProps={{
        title: t("createCustomEvaluator"),
        breadcrumb: [
          {
            name: t("evaluators"),
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
