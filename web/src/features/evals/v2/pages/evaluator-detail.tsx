import { useState } from "react";
import { useRouter } from "next/router";
import { ArrowLeft, History, MoreVertical, Trash2 } from "lucide-react";

import Page from "@/src/components/layouts/page";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ActivateEvaluatorDialog } from "@/src/features/evals/v2/components/ActivateEvaluatorDialog";
import { EvaluatorDefinitionView } from "@/src/features/evals/v2/components/EvaluatorConfigurationView";
import { EvaluatorEditView } from "@/src/features/evals/v2/components/EvaluatorEditView";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { observationVariableMappingList, singleFilter } from "@langfuse/shared";
import { z } from "zod";

export default function EvaluatorDetailPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const evaluatorId = router.query.evaluatorId as string;
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  // Bumped after every successful save to remount EvaluatorEditView, so its
  // internal "initial value" baselines (score name, mapping, ...) reset to
  // the just-saved values instead of staying frozen at first-mount.
  const [formResetKey, setFormResetKey] = useState(0);
  const utils = api.useUtils();
  const evaluator = api.evals.configById.useQuery(
    { projectId, id: evaluatorId },
    { enabled: Boolean(projectId && evaluatorId) },
  );
  const defaultModel = api.defaultLlmModel.fetchDefaultModel.useQuery(
    { projectId },
    {
      enabled:
        Boolean(projectId) &&
        evaluator.data?.evalTemplate?.type === "LLM_AS_JUDGE" &&
        !evaluator.data.evalTemplate.model,
    },
  );
  const evaluatorVersions = api.evals.allTemplatesForName.useQuery(
    {
      projectId,
      name: evaluator.data?.evalTemplate?.name ?? "",
      isUserManaged: evaluator.data?.evalTemplate?.projectId !== null,
    },
    {
      enabled: Boolean(
        versionHistoryOpen && projectId && evaluator.data?.evalTemplate?.name,
      ),
    },
  );

  const activationDialogOpen = router.query.activate === "1";
  const initialEvaluationRuleId =
    typeof router.query.ruleId === "string" ? router.query.ruleId : undefined;
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });
  const deleteEvaluator = api.evals.deleteEvalJob.useMutation({
    onError: (error) => trpcErrorToast(error),
    onSuccess: () => {
      setDeleteDialogOpen(false);
      setDeleteConfirmation("");
      showSuccessToast({
        title: "Evaluator deleted",
        description: "The evaluator has been deleted successfully.",
      });
      Promise.all([utils.evals.invalidate(), utils.evalsV2.invalidate()]).catch(
        () => undefined,
      );
      router.push(`/project/${projectId}/evals/v2`).catch(() => undefined);
    },
  });
  const estimatedCostUsdParam = router.query.estimatedCostUsd;
  const parsedEstimatedCostUsd =
    typeof estimatedCostUsdParam === "string"
      ? Number(estimatedCostUsdParam)
      : Number.NaN;
  const testRunCostUsd =
    Number.isFinite(parsedEstimatedCostUsd) && parsedEstimatedCostUsd >= 0
      ? parsedEstimatedCostUsd
      : null;
  const setActivationDialogOpen = (open: boolean) => {
    if (open) return;
    const query = { ...router.query };
    delete query.activate;
    delete query.estimatedCostUsd;
    router
      .replace({ pathname: router.pathname, query }, undefined, {
        shallow: true,
      })
      .catch(() => undefined);
  };
  const redirectToEvaluatorOverview = () => {
    router.replace(`/project/${projectId}/evals/v2`).catch(() => undefined);
  };

  if (evaluator.isPending) {
    return (
      <Page
        headerProps={{
          title: "Configure evaluator",
          breadcrumb: [
            { name: "Evaluators v2", href: `/project/${projectId}/evals/v2` },
          ],
        }}
      >
        <div className="flex flex-col gap-4 p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-72 w-full" />
        </div>
      </Page>
    );
  }

  const template = evaluator.data?.evalTemplate;
  if (!evaluator.data || !template) {
    return <div className="p-6">Evaluator not found</div>;
  }

  const data = evaluator.data;
  const filter = z.array(singleFilter).catch([]).parse(data.filter);
  const mappings = observationVariableMappingList
    .catch([])
    .parse(data.variableMapping);
  const sampling = data.sampling.toNumber();
  const versions = evaluatorVersions.data?.templates ?? [];
  const selectedVersion = versions.find(
    (version) => version.id === selectedVersionId,
  );
  const selectedVersionUsesProjectDefaultModel = Boolean(
    selectedVersion && (!selectedVersion.provider || !selectedVersion.model),
  );
  const selectedVersionModelLabel = selectedVersionUsesProjectDefaultModel
    ? defaultModel.data
      ? `${defaultModel.data.provider} / ${defaultModel.data.model}`
      : "Project default model"
    : selectedVersion
      ? `${selectedVersion.provider} / ${selectedVersion.model}`
      : "";

  return (
    <Page
      headerProps={{
        title: "Configure evaluator",
        fitTitleToContent: true,
        breadcrumb: [
          { name: "Evaluators v2", href: `/project/${projectId}/evals/v2` },
        ],
        actionButtonsRight: (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Show evaluator versions"
              title="Evaluator versions"
              onClick={() => setVersionHistoryOpen(true)}
            >
              <History className="h-3.5 w-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Evaluator actions"
                  title="Evaluator actions"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={!hasWriteAccess}
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      }}
    >
      <div className="flex h-full min-h-0 flex-col">
        <EvaluatorEditView
          key={`${data.id}-${formResetKey}`}
          projectId={projectId}
          evaluatorId={data.id}
          sourceTemplate={template}
          initialMapping={mappings}
          scoreName={data.scoreName}
          description={data.description ?? ""}
          attachedRuleIds={data.ruleAssignments.map(({ rule }) => rule.id)}
          initialEvaluationRuleId={initialEvaluationRuleId}
          onSaved={() => setFormResetKey((key) => key + 1)}
          onCancel={redirectToEvaluatorOverview}
        />
      </div>

      <ActivateEvaluatorDialog
        projectId={projectId}
        evaluatorId={data.id}
        evaluatorName={data.scoreName}
        setupFilter={filter}
        setupSampling={sampling}
        testRunCostUsd={testRunCostUsd}
        isCodeEvaluator={template.type === "CODE"}
        open={activationDialogOpen}
        onOpenChange={setActivationDialogOpen}
        onComplete={redirectToEvaluatorOverview}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeleteConfirmation("");
        }}
        title="Delete evaluator?"
        description="This action cannot be undone. It removes the evaluator and its execution logs. Scores produced by it will not be deleted."
        confirmLabel="Delete evaluator"
        loading={deleteEvaluator.isPending}
        confirmDisabled={deleteConfirmation !== data.scoreName}
        onConfirm={() =>
          deleteEvaluator.mutate({
            projectId,
            evalConfigId: data.id,
          })
        }
      >
        <div className="grid w-full gap-1.5">
          <Label htmlFor="delete-evaluator-confirmation">
            Type &quot;{data.scoreName}&quot; to confirm
          </Label>
          <Input
            id="delete-evaluator-confirmation"
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
          />
        </div>
      </ConfirmDialog>

      <Sheet
        open={versionHistoryOpen}
        onOpenChange={(open) => {
          setVersionHistoryOpen(open);
          if (!open) setSelectedVersionId(null);
        }}
      >
        <SheetContent className="flex flex-col gap-5 overflow-y-auto sm:max-w-2xl">
          {selectedVersion ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit px-2"
                onClick={() => setSelectedVersionId(null)}
              >
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                All versions
              </Button>
              <SheetHeader>
                <SheetTitle>Version {selectedVersion.version}</SheetTitle>
                <SheetDescription>
                  Saved {selectedVersion.createdAt.toLocaleString()}. This
                  definition is read-only.
                </SheetDescription>
              </SheetHeader>
              <div className="pb-6">
                <EvaluatorDefinitionView
                  evaluatorType={selectedVersion.type}
                  sourceCode={selectedVersion.sourceCode}
                  sourceCodeLanguage={selectedVersion.sourceCodeLanguage}
                  prompt={selectedVersion.prompt}
                  modelLabel={selectedVersionModelLabel}
                  usesProjectDefaultModel={
                    selectedVersionUsesProjectDefaultModel
                  }
                  outputDefinition={selectedVersion.outputDefinition}
                  mappings={[]}
                  showMappings={false}
                  showType={false}
                />
              </div>
            </>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle>Evaluator versions</SheetTitle>
                <SheetDescription>
                  Saved definition versions for {data.scoreName}. Version
                  history is read-only.
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-2">
                {evaluatorVersions.isPending ? (
                  <>
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </>
                ) : versions.length > 0 ? (
                  versions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      className="hover:bg-muted/50 flex w-full items-start justify-between gap-3 rounded-md border p-3 text-left transition-colors"
                      onClick={() => setSelectedVersionId(version.id)}
                    >
                      <div className="min-w-0">
                        <p
                          className="truncate text-sm font-bold"
                          title={`Version ${version.version}`}
                        >
                          Version {version.version}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {version.createdAt.toLocaleString()}
                        </p>
                      </div>
                      {version.id === template.id ? (
                        <span className="bg-light-green text-dark-green rounded-md px-2 py-0.5 text-xs font-bold">
                          Current
                        </span>
                      ) : null}
                    </button>
                  ))
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No saved versions found.
                  </p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Page>
  );
}
