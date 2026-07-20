import { useState } from "react";
import { useRouter } from "next/router";

import Page from "@/src/components/layouts/page";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EvaluatorTitleEditor } from "@/src/features/evals/v2/components/EvaluatorTitleEditor";
import {
  RuleSetupForm,
  type CatalogTemplate,
} from "@/src/features/evals/v2/components/RuleSetupForm";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { api } from "@/src/utils/api";

function toKebabCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function EvaluatorSetupPage({
  projectId,
  template,
  scratchType,
}: {
  projectId: string;
  template: CatalogTemplate | null;
  scratchType: "llm" | "code";
}) {
  const [scoreName, setScoreName] = useState(() =>
    template ? toKebabCase(template.name) : "",
  );
  const [description, setDescription] = useState("");

  return (
    <Page
      headerProps={{
        title: "New evaluator:",
        fitTitleToContent: true,
        titleBadges: (
          <EvaluatorTitleEditor
            scoreName={scoreName}
            onScoreNameChange={setScoreName}
          />
        ),
        titleDescription: (
          <Input
            aria-label="Evaluator description"
            className="text-muted-foreground placeholder:text-muted-foreground [field-sizing:content] h-5 max-w-full min-w-48 border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
            placeholder="Add a description (optional)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        ),
        breadcrumb: [
          { name: "Evaluators v2", href: `/project/${projectId}/evals/v2` },
        ],
      }}
    >
      <RuleSetupForm
        projectId={projectId}
        sourceTemplate={template}
        initialEvaluatorType={template?.type === "CODE" ? "code" : scratchType}
        scoreName={scoreName}
        description={description}
      />
    </Page>
  );
}

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

  if (templateResolving) {
    return (
      <Page
        headerProps={{
          title: "New evaluator",
          breadcrumb: [
            { name: "Evaluators v2", href: `/project/${projectId}/evals/v2` },
          ],
        }}
      >
        <div className="flex flex-col gap-4 p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Page>
    );
  }

  return (
    <EvaluatorSetupPage
      key={template?.id ?? `scratch-${scratchType}`}
      projectId={projectId}
      template={template}
      scratchType={scratchType}
    />
  );
}
