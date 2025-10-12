import Page from "@/src/components/layouts/page";
import { BreadcrumbSeparator } from "@/src/components/ui/breadcrumb";
import { BreadcrumbPage } from "@/src/components/ui/breadcrumb";
import { BreadcrumbItem } from "@/src/components/ui/breadcrumb";
import { Check } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { BreadcrumbList } from "@/src/components/ui/breadcrumb";
import { Breadcrumb } from "@/src/components/ui/breadcrumb";
import { useRouter } from "next/router";
import { SelectEvaluatorList } from "@/src/features/evals/components/select-evaluator-list";
import { RunEvaluatorForm } from "@/src/features/evals/components/run-evaluator-form";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { getMaintainer } from "@/src/features/evals/utils/typeHelpers";
import { MaintainerTooltip } from "@/src/features/evals/components/maintainer-tooltip";
import { ManageDefaultEvalModel } from "@/src/features/evals/components/manage-default-eval-model";
import { useTranslation } from "react-i18next";

// Multi-step setup process
// 1. Select Evaluator: /project/:projectId/evals/new
// 2. Configure Evaluator: /project/:projectId/evals/new?evaluator=:evaluatorId
export default function NewEvaluatorPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const evaluatorId = router.query.evaluator as string | undefined;
  // starts at 1 to align with breadcrumb
  const stepInt = !evaluatorId ? 1 : 2;

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "evalTemplate:CUD",
  });

  const evalTemplates = api.evals.allTemplates.useQuery(
    {
      projectId,
      limit: 500,
      page: 0,
    },
    {
      enabled: hasAccess,
    },
  );

  const currentTemplate = evalTemplates.data?.templates.find(
    (t) => t.id === evaluatorId,
  );

  if (!hasAccess) {
    return <div>{t("evaluation.eval.newEvaluator.noAccess")}</div>;
  }

  return (
    <Page
      withPadding
      headerProps={{
        title: t("evaluation.eval.newEvaluator.title"),
        breadcrumb: [
          {
            name: t("evaluation.eval.newEvaluator.runningEvaluators"),
            href: `/project/${projectId}/evals`,
          },
        ],
        actionButtonsRight: <ManageDefaultEvalModel projectId={projectId} />,
      }}
    >
      <Breadcrumb className="mb-3">
        <BreadcrumbList>
          <BreadcrumbItem
            className="hover:cursor-pointer"
            onClick={() => router.push(`/project/${projectId}/evals/new`)}
          >
            <BreadcrumbPage
              className={cn(
                stepInt !== 1
                  ? "text-muted-foreground"
                  : "font-semibold text-foreground",
              )}
            >
              {t("evaluation.eval.newEvaluator.selectEvaluator")}
              {stepInt > 1 && <Check className="ml-1 inline-block h-3 w-3" />}
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage
              className={cn(
                stepInt !== 2
                  ? "text-muted-foreground"
                  : "font-semibold text-foreground",
              )}
            >
              <div className="flex flex-row">
                {t("evaluation.eval.newEvaluator.runEvaluator")}
                {currentTemplate && (
                  <div className="flex flex-row gap-2">
                    <span>
                      {currentTemplate.name ? `: ${currentTemplate.name}` : ""}
                    </span>
                    <MaintainerTooltip
                      maintainer={getMaintainer(currentTemplate)}
                    />
                  </div>
                )}
              </div>
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      {
        // 1. Create Org
        stepInt === 1 && projectId && (
          <SelectEvaluatorList projectId={projectId} />
        )
      }
      {
        // 2. Run Evaluator
        stepInt === 2 && evaluatorId && projectId && (
          <RunEvaluatorForm
            projectId={projectId}
            evaluatorId={evaluatorId}
            evalTemplates={evalTemplates.data?.templates ?? []}
          />
        )
      }
    </Page>
  );
}
