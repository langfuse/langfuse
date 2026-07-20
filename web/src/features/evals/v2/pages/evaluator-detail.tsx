import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { History, MoreVertical, Pencil, Trash2 } from "lucide-react";

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
import { EvaluatorConfigurationView } from "@/src/features/evals/v2/components/EvaluatorConfigurationView";
import { EvaluatorEditView } from "@/src/features/evals/v2/components/EvaluatorEditView";
import { EvaluatorTitleEditor } from "@/src/features/evals/v2/components/EvaluatorTitleEditor";
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
  const [scoreName, setScoreName] = useState("");
  const [description, setDescription] = useState("");
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [scopeControlsContainer, setScopeControlsContainer] =
    useState<HTMLDivElement | null>(null);
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
  const editMode = router.query.edit === "1";
  const initialRunScopeId =
    typeof router.query.runScopeId === "string"
      ? router.query.runScopeId
      : undefined;
  const initialNewScope = router.query.newScope === "1";
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
  const setEditMode = (
    editing: boolean,
    runScopeId?: string,
    createNewScope = false,
  ) => {
    const query = { ...router.query };
    if (editing) {
      query.edit = "1";
      delete query.runScopeId;
      delete query.newScope;
      if (runScopeId) query.runScopeId = runScopeId;
      else if (createNewScope) query.newScope = "1";
    } else {
      delete query.edit;
      delete query.runScopeId;
      delete query.newScope;
    }
    router
      .replace({ pathname: router.pathname, query }, undefined, {
        shallow: true,
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    if (!evaluator.data) return;
    setScoreName(evaluator.data.scoreName);
    setDescription(evaluator.data.description ?? "");
  }, [evaluator.data]);

  if (evaluator.isPending) {
    return (
      <Page
        headerProps={{
          title: "Evaluator",
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
  const usesProjectDefaultModel = !template.provider || !template.model;
  const modelLabel = usesProjectDefaultModel
    ? defaultModel.data
      ? `${defaultModel.data.provider} / ${defaultModel.data.model}`
      : "Project default model"
    : `${template.provider} / ${template.model}`;
  const versions = evaluatorVersions.data?.templates ?? [];

  return (
    <Page
      headerProps={{
        title: `Evaluator: ${scoreName || data.scoreName}`,
        fitTitleToContent: true,
        titleBadges: editMode ? (
          <EvaluatorTitleEditor
            scoreName={scoreName}
            onScoreNameChange={setScoreName}
          />
        ) : null,
        titleDescription: editMode ? (
          <Input
            aria-label="Evaluator description"
            className="text-muted-foreground placeholder:text-muted-foreground [field-sizing:content] h-5 max-w-full min-w-48 border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
            placeholder="Add a description (optional)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        ) : data.description ? (
          <p className="text-muted-foreground text-sm">{data.description}</p>
        ) : null,
        breadcrumb: [
          { name: "Evaluators v2", href: `/project/${projectId}/evals/v2` },
        ],
        actionButtonsRight: (
          <div className="flex items-center gap-2">
            {editMode ? (
              <div className="contents" ref={setScopeControlsContainer} />
            ) : null}
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
            {!editMode ? (
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
                    onSelect={() => setEditMode(true)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!hasWriteAccess}
                    onSelect={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ),
      }}
    >
      <div className="flex h-full min-h-0 flex-col">
        {editMode ? (
          <EvaluatorEditView
            projectId={projectId}
            evaluatorId={data.id}
            sourceTemplate={template}
            initialMapping={mappings}
            scoreName={scoreName}
            description={description}
            attachedScopeIds={data.runScopeAssignments.map(
              ({ runScope }) => runScope.id,
            )}
            initialRunScopeId={initialRunScopeId}
            initialNewScope={initialNewScope}
            scopeControlsContainer={scopeControlsContainer}
            onSaved={() => setEditMode(false)}
            onCancel={() => {
              setScoreName(data.scoreName);
              setDescription(data.description ?? "");
              setEditMode(false);
            }}
          />
        ) : (
          <EvaluatorConfigurationView
            evaluatorType={template.type}
            sourceCode={template.sourceCode}
            sourceCodeLanguage={template.sourceCodeLanguage}
            prompt={template.prompt}
            modelLabel={modelLabel}
            usesProjectDefaultModel={usesProjectDefaultModel}
            outputDefinition={template.outputDefinition}
            mappings={mappings}
            projectId={projectId}
            evaluatorId={data.id}
            attachedRunScopes={data.runScopeAssignments.map(({ runScope }) => ({
              id: runScope.id,
              name: runScope.name,
              filter: z.array(singleFilter).catch([]).parse(runScope.filter),
            }))}
            hasWriteAccess={hasWriteAccess}
            onAttachRunScope={(runScopeId, createNewScope) =>
              setEditMode(true, runScopeId, createNewScope)
            }
          />
        )}
      </div>

      <ActivateEvaluatorDialog
        projectId={projectId}
        evaluatorId={data.id}
        evaluatorName={data.scoreName}
        targetObject={data.targetObject}
        setupFilter={filter}
        setupSampling={sampling}
        testRunCostUsd={testRunCostUsd}
        isCodeEvaluator={template.type === "CODE"}
        open={activationDialogOpen}
        onOpenChange={setActivationDialogOpen}
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

      <Sheet open={versionHistoryOpen} onOpenChange={setVersionHistoryOpen}>
        <SheetContent className="flex flex-col gap-5 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Evaluator versions</SheetTitle>
            <SheetDescription>
              Saved definition versions for {data.scoreName}. Version history is
              read-only.
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
                <div
                  key={version.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <p
                      className="truncate text-sm font-bold"
                      title={`Version ${version.version}`}
                    >
                      Version {version.version}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {version.createdAt.toLocaleString()} ·{" "}
                      {version.type === "CODE" ? "Code" : "LLM-as-a-judge"}
                    </p>
                  </div>
                  {version.id === template.id ? (
                    <span className="bg-light-green text-dark-green rounded-md px-2 py-0.5 text-xs font-bold">
                      Current
                    </span>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">
                No saved versions found.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Page>
  );
}
