import Page from "@/src/components/layouts/page";
import { BreadcrumbSeparator } from "@/src/components/ui/breadcrumb";
import { BreadcrumbPage } from "@/src/components/ui/breadcrumb";
import { BreadcrumbItem } from "@/src/components/ui/breadcrumb";
import { Check, Info } from "lucide-react";
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
import { DefaultEvalModelSetup } from "@/src/features/evals/components/default-eval-model-setup";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";
import {
  isCodeEvalTemplate,
  shouldShowEvalTemplate,
} from "@/src/features/evals/utils/code-eval-template-utils";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { useState } from "react";
import { Skeleton } from "@/src/components/ui/skeleton";

// Multi-step setup process
// 1. Select Evaluator: /project/:projectId/evals/new
// 2. Set up LLM connection (only after selecting an evaluator that needs it): /project/:projectId/evals/new?evaluator=:evaluatorId
// 3. Configure Evaluator: /project/:projectId/evals/new?evaluator=:evaluatorId
export default function NewEvaluatorPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const evaluatorId = router.query.evaluator as string | undefined;
  const [defaultModelConfiguredInFlow, setDefaultModelConfiguredInFlow] =
    useState(false);
  const codeEvalCapabilities = useIsCodeEvalEnabled();

  const hasDefaultModelReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalDefaultModel:read",
  });

  const defaultModelQuery = api.defaultLlmModel.fetchDefaultModel.useQuery(
    { projectId },
    { enabled: hasDefaultModelReadAccess && !!projectId },
  );

  const hasDefaultModel =
    !!defaultModelQuery.data || defaultModelConfiguredInFlow;

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

  const currentTemplate = evalTemplates.data?.templates
    .filter((template) =>
      shouldShowEvalTemplate(template, codeEvalCapabilities),
    )
    .find((t) => t.id === evaluatorId);

  const templatesForCurrentName = api.evals.allTemplatesForName.useQuery(
    {
      projectId,
      name: currentTemplate?.name ?? "",
      isUserManaged: Boolean(currentTemplate?.projectId),
    },
    {
      enabled: !!projectId && !!currentTemplate?.name,
      refetchOnMount: "always",
    },
  );

  const latestTemplate = templatesForCurrentName.data?.templates[0];
  const hasNewerTemplate =
    !!currentTemplate &&
    !!latestTemplate &&
    latestTemplate.id !== currentTemplate.id &&
    latestTemplate.version > currentTemplate.version;

  const handleUseUpdatedEvaluator = () => {
    if (!latestTemplate) return;

    router.replace(
      {
        pathname: router.pathname,
        query: {
          ...router.query,
          evaluator: latestTemplate.id,
        },
      },
      undefined,
      { shallow: true },
    );
  };

  const selectedTemplateUsesDefaultModel = Boolean(
    currentTemplate &&
    !isCodeEvalTemplate(currentTemplate) &&
    (!currentTemplate.provider || !currentTemplate.model),
  );
  const isCheckingDefaultModel = Boolean(
    selectedTemplateUsesDefaultModel &&
    defaultModelQuery.isLoading &&
    !defaultModelConfiguredInFlow,
  );
  const shouldSetupDefaultModel = Boolean(
    selectedTemplateUsesDefaultModel &&
    !hasDefaultModel &&
    !isCheckingDefaultModel,
  );
  const step = !evaluatorId
    ? "select"
    : isCheckingDefaultModel
      ? "loading"
      : shouldSetupDefaultModel
        ? "defaultModel"
        : "run";
  const selectedTemplateIsLlm = Boolean(
    currentTemplate && !isCodeEvalTemplate(currentTemplate),
  );
  const isProviderStepActive = step === "defaultModel" || step === "loading";
  const isProviderStepComplete = step === "run" && selectedTemplateIsLlm;

  if (!hasAccess) {
    return <div>You do not have access to this page.</div>;
  }

  return (
    <Page
      withPadding
      scrollable
      headerProps={{
        title: "Set up evaluator",
        breadcrumb: [
          {
            name: "Running Evaluators",
            href: `/project/${projectId}/evals`,
          },
        ],
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
                step !== "select"
                  ? "text-muted-foreground"
                  : "text-foreground font-semibold",
              )}
            >
              1. Select Evaluator
              {step !== "select" && (
                <Check className="ml-1 inline-block h-3 w-3" />
              )}
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage
              className={cn(
                isProviderStepActive
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground",
              )}
            >
              2. Set up LLM connection
              {isProviderStepComplete && (
                <Check className="ml-1 inline-block h-3 w-3" />
              )}
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage
              className={cn(
                step !== "run"
                  ? "text-muted-foreground"
                  : "text-foreground font-semibold",
              )}
            >
              <div className="flex flex-row">
                3. Run Evaluator
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
        // 1. Select Evaluator
        step === "select" && projectId && (
          <SelectEvaluatorList projectId={projectId} />
        )
      }
      {
        // 2. Set up LLM connection, when the selected evaluator requires it
        step === "defaultModel" && projectId && (
          <DefaultEvalModelSetup
            projectId={projectId}
            onSuccess={() => setDefaultModelConfiguredInFlow(true)}
          />
        )
      }
      {
        // Wait until the default-model check finishes before deciding whether
        // to run the evaluator setup or show the default-model form.
        step === "loading" && <Skeleton className="h-[500px] w-full" />
      }
      {
        // 3. Run Evaluator
        step === "run" && evaluatorId && projectId && (
          <div className="flex flex-col gap-4">
            {hasNewerTemplate && latestTemplate && currentTemplate ? (
              <Alert variant="info">
                <Info className="h-4 w-4" />
                <AlertTitle>Selected Evaluator has been updated</AlertTitle>
                <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Click to use the latest version of your evaluator{" "}
                    {latestTemplate.name}.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={handleUseUpdatedEvaluator}
                  >
                    Use updated evaluator
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            <RunEvaluatorForm
              projectId={projectId}
              evaluatorId={evaluatorId}
              evalTemplates={evalTemplates.data?.templates ?? []}
            />
          </div>
        )
      }
    </Page>
  );
}
