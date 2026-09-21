import React, { useEffect, useImperativeHandle, useRef, useState } from "react";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import Header from "@/src/components/layouts/header";
import { MultiSelectTagInput } from "@/src/components/design-system/MultiSelectTagInput/MultiSelectTagInput";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import {
  formatAnnotateDescription,
  isTextDataType,
  isNumericDataType,
} from "@/src/features/scores/lib/helpers";
import { AnnotateFormSchema } from "@/src/features/scores/schema";
import { getAnnotationTargetType } from "@/src/features/scores/lib/annotationAnalytics";
import {
  annotationFieldKey,
  getScoreConfigSelection,
} from "@/src/features/scores/lib/annotationConfigSelection";
import { useMergedAnnotationScores } from "@/src/features/scores/lib/useMergedAnnotationScores";
import { prepareAnnotationFormData } from "@/src/features/scores/lib/prepareAnnotationFormData";
import { transformToAnnotationScores } from "@/src/features/scores/lib/transformScores";
import { useScoreMutations } from "@/src/features/scores/hooks/useScoreMutations";
import { useAnnotationScoreConfigs } from "@/src/features/scores/hooks/useScoreConfigs";
import { useAnnotationKeyboard } from "@/src/features/scores/hooks/useAnnotationKeyboard";
import { createAnnotationFormActions } from "@/src/features/scores/actions/annotationFormActions";
import { AnnotationScoreRow } from "@/src/features/scores/components/AnnotationScoreRow";
import { AnnotationSaveStatus } from "@/src/features/scores/components/AnnotationSaveStatus";
import type {
  AnnotateFormSchemaType,
  AnnotationScoreSchemaType,
  PreparedAnnotationTarget,
  ScoreTarget,
  AnnotationForm as AnnotationFormType,
  AnnotationRefreshHandle,
} from "@/src/features/scores/types";

function AnnotateHeader({
  saveStatus,
  actionButtons,
  description,
}: {
  saveStatus: React.ReactNode;
  actionButtons: React.ReactNode;
  description: string;
}) {
  return (
    <Header
      title="Annotate"
      help={{
        description,
        href: "https://langfuse.com/docs/evaluation/evaluation-methods/annotation",
        className: "leading-relaxed",
      }}
      actionButtons={[
        <React.Fragment key="annotation-save-status">
          {saveStatus}
        </React.Fragment>,
        <React.Fragment key="annotation-actions">
          {actionButtons}
        </React.Fragment>,
      ]}
    />
  );
}

function annotationTargetLabel(scoreTarget: ScoreTarget) {
  if (scoreTarget.type === "session") return "Session";
  return scoreTarget.observationId ? "Observation" : "Trace";
}

const getEmptySelectedConfigIdsStorageKey = (scoreTarget: ScoreTarget) => {
  if (scoreTarget.type === "session") {
    return "emptySelectedConfigIds:session";
  }

  return scoreTarget.observationId
    ? "emptySelectedConfigIds:observation"
    : "emptySelectedConfigIds:trace";
};

export function AnnotationFormContent({
  targets,
  actionButtons,
  isActive = true,
  refreshRef,
}: {
  targets: PreparedAnnotationTarget[];
  actionButtons?: React.ReactNode;
  isActive?: boolean;
  refreshRef?: React.Ref<AnnotationRefreshHandle>;
}) {
  const capture = usePostHogClientCapture();
  const primaryTarget = targets[0]!;
  const { scoreMetadata, analyticsData } = primaryTarget;
  const allowManualSelection = targets.some(
    (target) => target.configControl.allowManualSelection,
  );
  const initialFormData = targets
    .flatMap((target) =>
      target.initialFormData.map((field) => ({
        ...field,
        targetKey: target.key,
      })),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const form = useForm<AnnotateFormSchemaType>({
    resolver: zodResolver(AnnotateFormSchema),
    defaultValues: { scoreData: initialFormData },
  });
  const { fields, update, remove, insert } = useFieldArray({
    control: form.control,
    name: "scoreData",
  });
  const { createMutation, updateMutation, deleteMutation } =
    useScoreMutations();
  const [actions] = useState(() =>
    createAnnotationFormActions({
      form,
      replaceField: update,
      insertField: insert,
      initialTargets: targets,
      capture,
      createScore: createMutation.mutateAsync,
      updateScore: updateMutation.mutateAsync,
      deleteScore: deleteMutation.mutateAsync,
    }),
  );
  useImperativeHandle(refreshRef, () => ({
    refresh(data) {
      const refreshed = targets.flatMap((target) => {
        const primary =
          target.scoreTarget.type === data.scoreTarget.type &&
          (target.scoreTarget.type !== "trace" ||
            data.scoreTarget.type !== "trace" ||
            target.scoreTarget.observationId ===
              data.scoreTarget.observationId);
        const scores = primary ? data.scores : data.companionTrace?.scores;
        if (!scores) return [];
        const selected = form
          .getValues("scoreData")
          .filter((field) => field.targetKey === target.key)
          .map((field) => field.configId);
        return prepareAnnotationFormData(
          transformToAnnotationScores(scores, target.configControl.configs),
          target.configControl.configs,
          selected,
        ).map((field) => ({ ...field, targetKey: target.key }));
      });
      actions.reconcileServerFields(refreshed);
    },
  }));
  // The analytics session follows the mounted form, not query refetches.
  useEffect(() => {
    actions.open();
    return () => actions.close();
  }, [actions]);
  const formRootRef = useRef<HTMLDivElement | null>(null);
  useAnnotationKeyboard({ formRootRef, form, actions, targets, isActive });

  const targetFor = (field: AnnotationScoreSchemaType) =>
    targets.find((target) => target.key === field.targetKey)!;
  const configFor = (field: AnnotationScoreSchemaType) =>
    targetFor(field).configControl.configs.find(
      (config) => config.id === field.configId,
    );
  const selectedConfigIds = [...new Set(fields.map((field) => field.configId))];
  const showSelectedTargets =
    new Set(
      fields.map((field) =>
        getAnnotationTargetType(targetFor(field).scoreTarget),
      ),
    ).size > 1;
  const description =
    targets.length > 1
      ? "Annotate the trace and observation with scores to capture human evaluation across different dimensions."
      : formatAnnotateDescription(primaryTarget.scoreTarget);
  const { selectionOptions } = getScoreConfigSelection({
    targets,
    controlledFields: [],
    insert,
    remove,
  });
  const visibleFields = fields.filter((field) => configFor(field));
  const rowCount = visibleFields.length;
  const optionRowCount = visibleFields.filter((field) => {
    const config = configFor(field)!;
    return (
      !isTextDataType(field.dataType) &&
      !isNumericDataType(field.dataType) &&
      !config.isArchived &&
      (config.categories?.length ?? 0) > 0
    );
  }).length;
  const hasEditableRow = visibleFields.some(
    (field) =>
      isTextDataType(field.dataType) || isNumericDataType(field.dataType),
  );

  return (
    <div
      ref={formRootRef}
      data-annotation-form
      className="ph-no-capture mx-auto w-full space-y-4 overflow-y-auto p-1 md:max-h-full"
    >
      <div className="sticky top-0 z-10 flex flex-col gap-4 rounded-sm bg-[hsl(var(--annotation-surface,var(--background)))] pb-2">
        <AnnotateHeader
          saveStatus={<AnnotationSaveStatus form={form} actions={actions} />}
          actionButtons={
            <>
              {allowManualSelection ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-accent gap-1.5 text-xs"
                  asChild
                >
                  <Link
                    href={`/project/${scoreMetadata.projectId}/settings/scores`}
                    target="_blank"
                    onClick={() => {
                      capture(
                        "score_configs:manage_configs_item_click",
                        analyticsData,
                      );
                    }}
                    onAuxClick={(event) => {
                      if (event.button === 1) {
                        capture(
                          "score_configs:manage_configs_item_click",
                          analyticsData,
                        );
                      }
                    }}
                  >
                    <Settings2 className="size-3" aria-hidden="true" />
                    Manage score configs
                  </Link>
                </Button>
              ) : null}
              {actionButtons}
            </>
          }
          description={description}
        />
        {allowManualSelection ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold">Scores</span>
            <MultiSelectTagInput
              disabled={!isActive}
              aria-label="Scores"
              placeholder="Choose scores"
              searchPlaceholder="Search scores..."
              emptyMessage="No scores found."
              options={selectionOptions}
              onValueChange={(values) =>
                getScoreConfigSelection({
                  targets,
                  controlledFields: form.getValues("scoreData"),
                  insert,
                  remove,
                }).handleSelectionChange(values)
              }
              value={selectedConfigIds}
            />
          </div>
        ) : null}
      </div>
      {/* No real submit: scores save per-field. Prevent the browser's implicit
            form submission (Enter in a single-line input would otherwise reload
            the page). */}
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="grid grid-flow-row gap-2.5">
          {fields.map((field, index) => {
            const target = targetFor(field);
            const config = configFor(field);
            return config ? (
              <AnnotationScoreRow
                key={field.id}
                isActive={isActive}
                form={form}
                actions={actions}
                index={index}
                fieldKey={annotationFieldKey(field)}
                target={target}
                config={config}
                showTarget={showSelectedTargets}
                formRootRef={formRootRef}
                commentSaving={updateMutation.isPending}
                targetOptions={
                  target.configControl.allowManualSelection
                    ? targets
                        .filter(
                          (candidate) =>
                            candidate.key !== target.key &&
                            candidate.configControl.allowManualSelection &&
                            candidate.configControl.configs.some(
                              (candidateConfig) =>
                                candidateConfig.id === config.id,
                            ),
                        )
                        .map((candidate) => ({
                          target: candidate,
                          hasField: fields.some(
                            (current) =>
                              current.configId === config.id &&
                              current.targetKey === candidate.key,
                          ),
                        }))
                    : []
                }
              />
            ) : null;
          })}
        </div>
        {rowCount > 0 && (
          // This legend only exists to advertise keyboard shortcuts, so hide
          // the whole strip on touch viewports rather than just the kbd
          // chips inside it — the shortcuts themselves still
          // work if a physical keyboard is attached.
          <div className="text-muted-foreground hidden flex-wrap items-center gap-x-2 gap-y-1 px-0.5 text-[11px] md:flex">
            {rowCount > 1 && (
              <span className="flex items-center gap-1">
                <KeyboardShortcut size="sm" keys={["ArrowUp"]} />
                <KeyboardShortcut size="sm" keys={["ArrowDown"]} />
                move between fields
              </span>
            )}
            {optionRowCount > 0 && (
              <span className="flex items-center gap-1">
                <KeyboardShortcut size="sm" keys={["1"]} />
                <span className="text-muted-foreground">…</span>
                <KeyboardShortcut size="sm" keys={["9"]} />
                select option
              </span>
            )}
            {hasEditableRow && (
              <span className="flex items-center gap-1">
                <KeyboardShortcut size="sm" keys={["Enter"]} />
                edit field
              </span>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

export function usePreparedAnnotationFormTarget<Target extends ScoreTarget>({
  scoreTarget,
  serverScores,
  scoreMetadata,
  analyticsData,
  configSelection = { mode: "selectable" },
}: AnnotationFormType<Target>) {
  const { projectId } = scoreMetadata;
  const emptySelectedConfigIdsStorageKey =
    getEmptySelectedConfigIdsStorageKey(scoreTarget);
  const {
    isLoading,
    availableConfigs,
    selectedConfigIds,
    setSelectedConfigIds,
  } = useAnnotationScoreConfigs({
    projectId,
    configSelection,
    emptySelectedConfigIdsStorageKey,
  });

  const serverAnnotationScores = Array.isArray(serverScores)
    ? transformToAnnotationScores(serverScores, availableConfigs)
    : transformToAnnotationScores(
        serverScores,
        availableConfigs,
        scoreTarget.type === "trace" ? scoreTarget.traceId : "",
        scoreTarget.type === "trace" ? scoreTarget.observationId : undefined,
      );

  const annotationScores = useMergedAnnotationScores(
    serverAnnotationScores,
    scoreTarget,
  );

  const initialFormData = prepareAnnotationFormData(
    annotationScores,
    availableConfigs,
    selectedConfigIds,
  );

  return {
    isLoading,
    target: {
      key: JSON.stringify([
        scoreMetadata.projectId,
        scoreMetadata.queueId,
        scoreTarget,
        analyticsData.source,
        analyticsData.isV4,
      ]),
      label: annotationTargetLabel(scoreTarget),
      scoreTarget,
      initialFormData,
      scoreMetadata,
      analyticsData,
      configControl: {
        configs: availableConfigs,
        allowManualSelection: configSelection.mode === "selectable",
        emptySelectedConfigIdsStorageKey,
        selectedConfigIds,
        setSelectedConfigIds,
      },
    } satisfies PreparedAnnotationTarget,
  };
}

export function AnnotationForm<Target extends ScoreTarget>(
  props: AnnotationFormType<Target>,
) {
  const { isLoading, target } = usePreparedAnnotationFormTarget(props);
  return isLoading ? (
    <Skeleton className="h-full w-full" />
  ) : (
    <AnnotationFormContent
      key={target.key}
      targets={[target]}
      actionButtons={props.actionButtons}
      isActive={props.isActive}
      refreshRef={props.refreshRef}
    />
  );
}
