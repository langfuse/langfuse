import { useRouter } from "next/router";

import Page from "@/src/components/layouts/page";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  RuleSetupForm,
  type CatalogTemplate,
} from "@/src/features/evals/v2/components/RuleSetupForm";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { api } from "@/src/utils/api";

/**
 * Standalone evaluator setup page. The template gallery lives on the
 * evaluators list (`?gallery=1`) and deep-links here:
 *   ?templateId=<id>   start from a catalog or project template
 *   ?scratch=llm|code  start from scratch (default: llm)
 */
export default function NewEvaluationRulePage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const templateId =
    typeof router.query.templateId === "string"
      ? router.query.templateId
      : null;
  const scratchType = router.query.scratch === "code" ? "code" : "llm";

  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });

  // Resolve the example from both gallery sources: the maintained catalog
  // and the project's custom evaluators.
  const catalog = api.evalsV2.catalog.useQuery(
    { projectId },
    { enabled: Boolean(projectId && templateId) },
  );
  const projectTemplates = api.evalsV2.projectTemplates.useQuery(
    { projectId },
    { enabled: Boolean(projectId && templateId) },
  );

  const template: CatalogTemplate | null = templateId
    ? (catalog.data?.find((t) => t.id === templateId) ??
      projectTemplates.data?.find((t) => t.id === templateId) ??
      null)
    : null;
  const templateResolving =
    Boolean(templateId) &&
    template === null &&
    (catalog.isLoading || projectTemplates.isLoading);

  if (!hasWriteAccess) {
    return <SupportOrUpgradePage />;
  }

  return (
    <Page
      headerProps={{
        title: "New evaluator",
        breadcrumb: [
          { name: "Evaluators", href: `/project/${projectId}/evals` },
        ],
        help: {
          description:
            "Define the evaluator on the left (name, prompt or code, score output), and which observations it runs on to the right (filter, sample, variable mapping) — then save it as a draft or save and run it.",
        },
      }}
    >
      {templateResolving ? (
        <div className="flex flex-col gap-4 p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <RuleSetupForm
          key={template?.id ?? `scratch-${scratchType}`}
          projectId={projectId}
          sourceTemplate={template}
          initialEvaluatorType={
            template?.type === "CODE" ? "code" : scratchType
          }
        />
      )}
    </Page>
  );
}
