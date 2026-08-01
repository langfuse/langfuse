import { useState } from "react";
import { useRouter } from "next/router";
import { History, ListTree, MoreVertical, Trash2 } from "lucide-react";

import Page from "@/src/components/layouts/page";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ActivateEvaluatorDialog } from "@/src/features/evals/v2/components/ActivateEvaluatorDialog";
import { CreateEvaluationRuleDialog } from "@/src/features/evals/v2/components/CreateEvaluationRuleDialog";
import { EvaluatorEditView } from "@/src/features/evals/v2/components/EvaluatorEditView";
import { EvaluatorRuleAssignments } from "@/src/features/evals/v2/components/EvaluatorRuleAssignments";
import { TablePeekViewEvaluationRuleDetail } from "@/src/features/evals/v2/components/EvaluationRulePeekView";
import { EvaluatorVersionHistorySheet } from "@/src/features/evals/v2/components/production/evaluator-detail/EvaluatorVersionHistorySheet";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { observationVariableMappingList, singleFilter } from "@langfuse/shared";
import { z } from "zod";

const EVALUATION_RULE_PEEK_CONFIG = {
  queryParams: [
    "editRule",
    "peekView",
    "observation",
    "display",
    "timestamp",
    "mappingEvaluatorId",
  ],
  extractParamsValuesFromRow: (row: {
    openEdit?: boolean;
    mappingEvaluatorId?: string;
  }): Record<string, string> => ({
    ...(row.openEdit ? { editRule: "1" } : {}),
    ...(row.mappingEvaluatorId
      ? { mappingEvaluatorId: row.mappingEvaluatorId }
      : {}),
  }),
};

export default function EvaluatorDetailPage() {
  const router = useRouter();
  const evaluationRulePeekNavigation = usePeekNavigation(
    EVALUATION_RULE_PEEK_CONFIG,
  );
  const projectId = router.query.projectId as string;
  const evaluatorId = router.query.evaluatorId as string;
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [createRuleDialogOpen, setCreateRuleDialogOpen] = useState(false);
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
  const setActivationDialogOpen = async (open: boolean) => {
    if (open) return;
    const query = { ...router.query };
    delete query.activate;
    await router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
  };
  const redirectToEvaluatorOverview = () => {
    router.replace(`/project/${projectId}/evals/v2`).catch(() => undefined);
  };
  const openEvaluationRule = (ruleId: string) => {
    setRulesOpen(false);
    evaluationRulePeekNavigation.openPeek(ruleId, { openEdit: true });
  };
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
        breadcrumb: [
          { name: "Evaluators v2", href: `/project/${projectId}/evals/v2` },
        ],
        actionButtonsRight: (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              aria-expanded={rulesOpen}
              onClick={() => setRulesOpen(true)}
            >
              <ListTree className="mr-1.5 h-3.5 w-3.5" />
              Rules
              <Badge variant="secondary" size="sm" className="ml-1.5">
                {data.ruleAssignments.length}
              </Badge>
            </Button>
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
          key={`${data.id}-${initialEvaluationRuleId ?? "default"}-${formResetKey}`}
          projectId={projectId}
          evaluatorId={data.id}
          sourceTemplate={template}
          initialMapping={mappings}
          scoreName={data.scoreName}
          description={data.description ?? ""}
          attachedRuleIds={data.ruleAssignments.map(({ rule }) => rule.id)}
          initialEvaluationRuleId={initialEvaluationRuleId}
          ruleEditorExpanded={
            !createRuleDialogOpen && router.query.editRule !== "1"
          }
          onSaved={() => setFormResetKey((key) => key + 1)}
          onCancel={redirectToEvaluatorOverview}
        />
      </div>

      {router.query.editRule === "1" ? (
        <TablePeekViewEvaluationRuleDetail
          itemType="EVALUATION_RULE"
          projectId={projectId}
          closePeek={evaluationRulePeekNavigation.closePeek}
        />
      ) : null}

      <ActivateEvaluatorDialog
        projectId={projectId}
        evaluatorId={data.id}
        evaluatorName={data.scoreName}
        attachedRuleIds={data.ruleAssignments.map(({ rule }) => rule.id)}
        setupFilter={filter}
        setupSampling={sampling}
        testRunCostUsd={testRunCostUsd}
        isCodeEvaluator={template.type === "CODE"}
        open={activationDialogOpen}
        onOpenChange={setActivationDialogOpen}
        onComplete={redirectToEvaluatorOverview}
        onCreateRule={async () => {
          await setActivationDialogOpen(false);
          setCreateRuleDialogOpen(true);
        }}
        onReviewRule={async (ruleId) => {
          await setActivationDialogOpen(false);
          evaluationRulePeekNavigation.openPeek(ruleId, {
            openEdit: true,
            mappingEvaluatorId: data.id,
          });
        }}
      />

      {createRuleDialogOpen ? (
        <CreateEvaluationRuleDialog
          projectId={projectId}
          open
          onOpenChange={(open) => {
            setCreateRuleDialogOpen(open);
            if (!open) {
              utils.evals.configById
                .invalidate({ projectId, id: data.id })
                .catch(() => undefined);
            }
            if (!open && "estimatedCostUsd" in router.query) {
              const query = { ...router.query };
              delete query.estimatedCostUsd;
              router
                .replace({ pathname: router.pathname, query }, undefined, {
                  shallow: true,
                })
                .catch(() => undefined);
            }
          }}
          initialFilterState={filter}
          initialSampling={sampling}
          initialEvaluatorIds={[data.id]}
          testRunCostUsdByEvaluatorId={
            testRunCostUsd === null ? {} : { [data.id]: testRunCostUsd }
          }
        />
      ) : null}

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

      <Sheet open={rulesOpen} onOpenChange={setRulesOpen} modal={false}>
        <SheetContent
          showOverlay={false}
          className="flex flex-col gap-5 overflow-y-auto shadow-[-12px_0_32px_-16px_hsl(var(--foreground)/0.3)] sm:max-w-lg dark:shadow-[-12px_0_32px_-16px_hsl(var(--background)/0.3)]"
        >
          <SheetHeader>
            <SheetTitle>Rules</SheetTitle>
            <SheetDescription>
              {data.ruleAssignments.length === 0
                ? "Use this evaluator in a rule to run it on incoming production data."
                : `This evaluator is used by ${data.ruleAssignments.length} ${data.ruleAssignments.length === 1 ? "rule" : "rules"}. Attach it to another rule or remove an existing connection.`}
            </SheetDescription>
          </SheetHeader>
          <EvaluatorRuleAssignments
            projectId={projectId}
            evaluatorId={data.id}
            evaluatorName={data.scoreName}
            rules={data.ruleAssignments.map(({ rule }) => ({
              id: rule.id,
              name: rule.name,
              filter: z.array(singleFilter).catch([]).parse(rule.filter),
              enabled: rule.enabled,
            }))}
            hasWriteAccess={hasWriteAccess}
            onView={openEvaluationRule}
            onCreateRule={() => {
              setRulesOpen(false);
              setCreateRuleDialogOpen(true);
            }}
            onReviewEvaluator={() => setRulesOpen(false)}
            showHeading={false}
          />
        </SheetContent>
      </Sheet>

      <EvaluatorVersionHistorySheet
        open={versionHistoryOpen}
        onOpenChange={(open) => {
          setVersionHistoryOpen(open);
          if (!open) setSelectedVersionId(null);
        }}
        evaluatorName={data.scoreName}
        versions={versions}
        currentVersionId={template.id}
        selectedVersion={selectedVersion}
        selectedVersionModelLabel={selectedVersionModelLabel}
        selectedVersionUsesProjectDefaultModel={
          selectedVersionUsesProjectDefaultModel
        }
        isLoading={evaluatorVersions.isPending}
        onSelectVersion={setSelectedVersionId}
        onBack={() => setSelectedVersionId(null)}
      />
    </Page>
  );
}
