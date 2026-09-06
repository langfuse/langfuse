import { useRouter } from "next/router";
import { Skeleton } from "@/src/components/ui/skeleton";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { CardDescription } from "@/src/components/ui/card";
import { EvaluatorForm } from "@/src/features/evals/components/evaluator-form";
import { usePeekEvalConfigData } from "@/src/components/table/peek/hooks/usePeekEvalConfigData";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { AlertTriangle, UserCircle2Icon } from "lucide-react";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { DeleteEvalConfigButton } from "@/src/components/deleteButton";
import { DeactivateEvalConfig } from "@/src/features/evals/components/deactivate-config";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useState } from "react";
import { cn } from "@/src/utils/tailwind";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";
import { EvaluatorPausedCallout } from "@/src/features/evals/components/evaluator-paused-callout";
import {
  requiresLegacyMigrationAction,
  isLegacyEvalTarget,
} from "@/src/features/evals/utils/typeHelpers";
import { useLazyEvaluatorExecutionCounts } from "@/src/features/evals/hooks/useLazyEvaluatorExecutionCounts";
import { TablePeekView } from "@/src/components/table/peek";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import { useEvalCapabilities } from "@/src/features/evals/hooks/useEvalCapabilities";
import { Alert } from "@/src/components/design-system/Alert/Alert";

const PeekViewEvaluatorConfigDetail = ({
  projectId,
  readOnly,
}: {
  projectId: string;
  readOnly: boolean;
}) => {
  const router = useRouter();
  const peekId = router.query.peek as string | undefined;
  const [isEditMode, setIsEditMode] = useState(false);
  const utils = api.useUtils();
  const { allowLegacy } = useEvalCapabilities(projectId);
  const { data: evalConfig } = usePeekEvalConfigData({
    jobConfigurationId: peekId,
    projectId,
  });
  const lazyExecutionCounts = useLazyEvaluatorExecutionCounts({
    projectId,
    evaluatorId: evalConfig?.id,
    evaluator: evalConfig,
  });
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "evaluationRule:CUD",
  });

  if (!evalConfig) {
    return <Skeleton className="h-full w-full rounded-none" />;
  }

  const displayStatus =
    lazyExecutionCounts.displayStatus ?? evalConfig.displayStatus;

  const evaluatorRequiresMigration = requiresLegacyMigrationAction({
    targetObject: evalConfig.targetObject,
    status: evalConfig.status,
    timeScope: Array.isArray(evalConfig.timeScope) ? evalConfig.timeScope : [],
  });
  const legacyEditingDisabled =
    isLegacyEvalTarget(evalConfig.targetObject) && !allowLegacy;
  const showLegacyReadOnlyNotice =
    isLegacyEvalTarget(evalConfig.targetObject) &&
    (readOnly || legacyEditingDisabled);
  const editModeDisabled = readOnly || !hasAccess || legacyEditingDisabled;
  const editModeDisabledReason = readOnly
    ? "This legacy evaluator is inactive and can only be viewed or deleted"
    : legacyEditingDisabled
      ? "Deprecated evaluators are only available in read-only mode"
      : undefined;

  return (
    <div className="grid h-full flex-1 grid-rows-[auto_auto_1fr] gap-2 overflow-hidden p-3 contain-layout">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex flex-row items-center gap-2">
            <span className="max-h-fit text-lg font-bold">Configuration</span>
            <div className="flex items-center gap-2">
              <StatusBadge type={displayStatus.toLowerCase()} isLive />
              {!readOnly ? (
                <DeactivateEvalConfig
                  projectId={projectId}
                  evalConfig={evalConfig}
                  // Status changes remount the form below; drop edit mode so
                  // in-progress form state cannot fight the new status.
                  onStatusChange={() => setIsEditMode(false)}
                />
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {evaluatorRequiresMigration && (
              <span className="bg-light-yellow text-dark-yellow inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap">
                Deprecated
              </span>
            )}
            <span
              className={cn(
                "text-sm",
                isEditMode ? "" : "text-muted-foreground",
              )}
            >
              Edit Mode
            </span>
            <Switch
              disabled={editModeDisabled}
              checked={isEditMode}
              onCheckedChange={setIsEditMode}
              title={editModeDisabledReason}
            />
            <DeleteEvalConfigButton
              aria-label="delete"
              itemId={evalConfig.id}
              projectId={projectId}
              deleteConfirmation={evalConfig.scoreName}
              // The peek only exists on the evals list page; redirecting there
              // drops the peek query params and closes it after deletion.
              redirectUrl={`/project/${projectId}/evals/legacy`}
              icon
              variant="ghost"
              size="icon-xs"
              title="Delete"
            />
          </div>
        </div>

        {showLegacyReadOnlyNotice ? (
          <Alert variant="warning" icon={AlertTriangle}>
            <Alert.Title>Legacy evaluator is read-only</Alert.Title>
            <Alert.Description>
              This evaluator uses a legacy target that the current rule editor
              cannot represent safely. You can review or delete it here, but it
              cannot be edited or reactivated.
            </Alert.Description>
          </Alert>
        ) : null}
      </div>

      {evalConfig.blockedAt && (
        <EvaluatorPausedCallout
          projectId={projectId}
          evalConfig={evalConfig}
          blockedAt={evalConfig.blockedAt}
          allowReactivation={!readOnly}
        />
      )}

      <CardDescription className="flex items-center text-sm">
        <span className="mr-2 text-sm font-bold">Referenced Evaluator</span>
        {evalConfig.evalTemplate && (
          <span className="mr-1 flex min-h-6 items-center">
            <TextLink
              path={`/project/${projectId}/evals/templates/${evalConfig.evalTemplate.id}`}
              value={evalConfig.evalTemplate.name}
              title={evalConfig.evalTemplate.name}
            />
          </span>
        )}
        {evalConfig.evalTemplate && (
          <Tooltip>
            <TooltipTrigger>
              {evalConfig.evalTemplate.projectId === null ? (
                <LangfuseIcon size={16} />
              ) : (
                <UserCircle2Icon className="h-4 w-4" />
              )}
            </TooltipTrigger>
            <TooltipContent>
              {evalConfig.evalTemplate.partner ?? "Langfuse"}
            </TooltipContent>
          </Tooltip>
        )}
      </CardDescription>
      <div className="flex max-h-full w-full flex-col items-start justify-between space-y-2 overflow-y-auto pb-4">
        {evalConfig.evalTemplate ? (
          <EvaluatorForm
            key={`${evalConfig.id}-${evalConfig.updatedAt}-${isEditMode}`}
            projectId={projectId}
            evalTemplates={[evalConfig.evalTemplate]}
            existingEvaluator={{
              ...evalConfig,
              evalTemplate: evalConfig.evalTemplate,
            }}
            mode="edit"
            disabled={!isEditMode}
            shouldWrapVariables={true}
            useDialog={false}
            onFormSuccess={() => {
              setIsEditMode(false);
              utils.evals.invalidate();
              showSuccessToast({
                title: "Running Evaluator updated",
                description: "The evaluator configuration has been updated.",
              });
            }}
          />
        ) : (
          <Alert icon={AlertTriangle}>
            <Alert.Title>Referenced evaluator unavailable</Alert.Title>
            <Alert.Description>
              This legacy rule no longer has an evaluator attached, so its
              evaluator configuration cannot be displayed.
            </Alert.Description>
          </Alert>
        )}
      </div>
    </div>
  );
};

export const TablePeekViewEvaluatorConfigDetail = (
  props: Omit<
    React.ComponentProps<typeof TablePeekView>,
    "children" | "title"
  > & {
    projectId: string;
    readOnly: boolean;
  },
) => {
  const { projectId, readOnly, ...peekProps } = props;

  return (
    <TablePeekView {...peekProps}>
      <PeekViewEvaluatorConfigDetail
        projectId={projectId}
        readOnly={readOnly}
      />
    </TablePeekView>
  );
};
