/* eslint-disable no-nested-ternary */
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import {
  MessageCircleMore,
  MessageCircle,
  X,
  Archive,
  Check,
  Trash,
  Settings2,
} from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import {
  isPresent,
  type ScoreConfigDomain,
  type UpdateAnnotationScoreData,
  type CreateAnnotationScoreData,
  TEXT_SCORE_MAX_LENGTH,
} from "@langfuse/shared";
import { Input } from "@/src/components/ui/input";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Textarea } from "@/src/components/ui/textarea";
import { HoverCardContent } from "@radix-ui/react-hover-card";
import { HoverCard, HoverCardTrigger } from "@/src/components/ui/hover-card";
import {
  formatAnnotateDescription,
  isTextDataType,
  isNumericDataType,
  isScoreUnsaved,
} from "@/src/features/scores/lib/helpers";
import Header from "@/src/components/layouts/header";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { cn } from "@/src/utils/tailwind";
import {
  type AnnotationScoreFormData,
  type PreparedAnnotationTarget,
  type ScoreTarget,
  type AnnotationForm as AnnotationFormType,
} from "@/src/features/scores/types";
import { AnnotateFormSchema } from "@/src/features/scores/schema";
import { ScoreConfigDetails } from "@/src/features/score-configs/components/ScoreConfigDetails";
import {
  enrichCategoryOptionsWithStaleScoreValue,
  resolveCategoricalNumericValue,
  validateNumericScore,
} from "@/src/features/scores/lib/annotationFormHelpers";
import { useMergedAnnotationScores } from "@/src/features/scores/lib/useMergedAnnotationScores";
import { transformToAnnotationScores } from "@/src/features/scores/lib/transformScores";
import { v4 as uuid } from "uuid";
import { useScoreMutations } from "@/src/features/scores/hooks/useScoreMutations";
import { MultiSelectTagInput } from "@/src/components/design-system/MultiSelectTagInput/MultiSelectTagInput";
import {
  CategoricalScoreInput,
  shouldUseCombobox,
} from "@/src/features/scores/components/CategoricalScoreInput";
import {
  createAnnotationAnalytics,
  getAnnotationTargetType,
} from "@/src/features/scores/lib/annotationAnalytics";
import {
  annotationFieldKey,
  getScoreConfigSelection,
} from "@/src/features/scores/lib/annotationConfigSelection";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import {
  hasBlockingOverlay,
  hasModifier,
} from "@/src/features/scores/lib/keyboardShortcuts";
import { useAnnotationScoreConfigs } from "@/src/features/scores/hooks/useScoreConfigs";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { Badge } from "@/src/components/ui/badge";

function CommentField({
  savedComment,
  disabled,
  loading,
  onSave,
}: {
  savedComment: string | null;
  disabled: boolean;
  loading: boolean;
  onSave: (comment: string | null) => void;
}) {
  const [localValue, setLocalValue] = useState(savedComment || "");

  // Reset local value when saved comment changes (after mutation completes)
  useEffect(() => {
    setLocalValue(savedComment || "");
  }, [savedComment]);

  const hasChanges = localValue.trim() !== (savedComment || "");

  return (
    <div className="relative">
      <div className="mb-1 flex items-center justify-between">
        <FormLabel className="text-sm">Score Comment</FormLabel>
        <div className="relative">
          {savedComment && (
            <PopoverClose asChild>
              <Button
                variant="ghost"
                type="button"
                size="icon-xs"
                loading={loading}
                onClick={() => onSave(null)}
              >
                <Trash className="h-3 w-3" />
              </Button>
            </PopoverClose>
          )}
        </div>
      </div>
      <Textarea
        className="text-xs"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        disabled={disabled}
      />

      {hasChanges && (
        <div className="mt-2 flex justify-end gap-1">
          <PopoverClose asChild>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-xs"
              disabled={disabled}
              loading={loading}
              onClick={() => {
                setLocalValue(savedComment || "");
              }}
            >
              Discard Changes
            </Button>
          </PopoverClose>
          <PopoverClose asChild>
            <Button
              type="button"
              size="sm"
              className="text-xs"
              disabled={disabled}
              loading={loading}
              onClick={() => {
                onSave(localValue);
              }}
            >
              Save Changes
            </Button>
          </PopoverClose>
        </div>
      )}
    </div>
  );
}

function AnnotateHeader({
  saveStatus,
  actionButtons,
  description,
}: {
  saveStatus: "idle" | "saving" | "saved" | "error";
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
        saveStatus !== "idle" ? (
          <div
            role="status"
            aria-label="Score save status"
            className="flex items-center justify-end"
            key="saving-spinner"
          >
            <div className="mr-1 items-center justify-center">
              {saveStatus === "saving" ? (
                <Spinner size="xxs" />
              ) : saveStatus === "saved" ? (
                <Check className="h-3 w-3" />
              ) : null}
            </div>
            <span className="text-muted-foreground text-xs">
              {saveStatus === "saving"
                ? "Saving…"
                : saveStatus === "saved"
                  ? "Saved"
                  : "Could not save"}
            </span>
          </div>
        ) : null,
        actionButtons,
      ]}
    />
  );
}

const isInputDisabled = (config: ScoreConfigDomain) => {
  return config.isArchived;
};

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
}: {
  targets: PreparedAnnotationTarget[];
  actionButtons?: React.ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const primaryTarget = targets[0]!;
  const { scoreMetadata, analyticsData } = primaryTarget;
  const configs = targets.flatMap((target) => target.configControl.configs);
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
  const targetFor = (field: AnnotationScoreFormData) =>
    targets.find((target) => target.key === field.targetKey)!;
  const configFor = (field: AnnotationScoreFormData | undefined) =>
    field
      ? targetFor(field).configControl.configs.find(
          (config) => config.id === field.configId,
        )
      : undefined;

  // Initialize form with initial data (never updates)
  const form = useForm({
    resolver: zodResolver(AnnotateFormSchema),
    defaultValues: { scoreData: initialFormData },
  });
  const [analytics] = useState(
    () =>
      new Map(
        targets.map((target) => [
          target.key,
          createAnnotationAnalytics(
            capture,
            {
              ...target.analyticsData,
              targetType: getAnnotationTargetType(target.scoreTarget),
            },
            target.initialFormData,
          ),
        ]),
      ),
  );
  const { getValues } = form;

  // Connect the visible form lifetime to the analytics session.
  useEffect(() => {
    analytics.forEach((tracker) => tracker.open());
    return () =>
      analytics.forEach((tracker, key) =>
        tracker.close(
          getValues("scoreData").filter((field) => field.targetKey === key),
        ),
      );
  }, [analytics, getValues]);

  const { fields, update, remove, insert } = useFieldArray({
    control: form.control,
    name: "scoreData",
  });

  // Watch form values to keep fields in sync
  const watchedScoreData = form.watch("scoreData");
  const controlledFields = fields.map((field, index) => {
    return {
      ...field,
      ...watchedScoreData[index],
    };
  });
  const selectedConfigIds = fields.map(annotationFieldKey);
  const showOptionTargets =
    new Set(
      targets.map((target) => getAnnotationTargetType(target.scoreTarget)),
    ).size > 1;
  const showSelectedTargets =
    new Set(
      controlledFields.map((field) =>
        getAnnotationTargetType(targetFor(field).scoreTarget),
      ),
    ).size > 1;

  const description =
    targets.length > 1
      ? "Annotate the trace and observation with scores to capture human evaluation across different dimensions."
      : formatAnnotateDescription(primaryTarget.scoreTarget);

  // Mutations - write to cache but form doesn't consume cache updates
  const { createMutation, updateMutation, deleteMutation } =
    useScoreMutations();

  // Config selection
  const { selectionOptions, handleSelectionChange } = getScoreConfigSelection({
    targets,
    controlledFields,
    insert,
    remove,
  });

  const [saveState, setSaveState] = useState({
    pending: 0,
    failed: false,
    saved: false,
  });
  const [confirmedFields, setConfirmedFields] = useState<
    Map<string, { field: AnnotationScoreFormData; sequence: number }>
  >(
    () =>
      new Map(
        initialFormData.map((field) => [
          annotationFieldKey(field),
          { field, sequence: 0 },
        ]),
      ),
  );
  const saveSequence = useRef(0);
  const latestSaves = useRef(new Map<string, number>());
  const hasUnsavedChanges = controlledFields.some((field) => {
    const confirmed = confirmedFields.get(annotationFieldKey(field))?.field;
    return (
      (field.value ?? null) !== (confirmed?.value ?? null) ||
      (field.stringValue ?? "") !== (confirmed?.stringValue ?? "") ||
      (field.comment ?? "") !== (confirmed?.comment ?? "")
    );
  });
  const saveStatus =
    saveState.pending > 0
      ? "saving"
      : saveState.failed
        ? "error"
        : saveState.saved && !hasUnsavedChanges
          ? "saved"
          : "idle";
  const trackSave = (
    operation: Promise<unknown>,
    tracked: ReturnType<
      ReturnType<typeof createAnnotationAnalytics>["beginSave"]
    >,
    field: AnnotationScoreFormData,
    onFailure: () => void,
  ) => {
    const sequence = ++saveSequence.current;
    const key = annotationFieldKey(field);
    const confirmed = confirmedFields.get(key)?.field;
    const changed =
      (field.id ?? null) !== (confirmed?.id ?? null) ||
      (field.value ?? null) !== (confirmed?.value ?? null) ||
      (field.stringValue ?? "") !== (confirmed?.stringValue ?? "") ||
      (field.comment ?? "") !== (confirmed?.comment ?? "");
    latestSaves.current.set(key, sequence);
    setSaveState((state) => ({
      pending: state.pending + 1,
      failed: state.pending ? state.failed : false,
      saved: state.saved,
    }));
    operation.then(
      () => {
        setConfirmedFields((current) => {
          if ((current.get(key)?.sequence ?? 0) > sequence) return current;
          const next = new Map(current);
          next.set(key, { field: { ...field }, sequence });
          return next;
        });
        tracked?.success();
        setSaveState((state) => ({
          ...state,
          pending: state.pending - 1,
          saved: state.saved || changed,
        }));
      },
      () => {
        if (latestSaves.current.get(key) === sequence) onFailure();
        tracked?.failure();
        setSaveState((state) => ({
          ...state,
          pending: state.pending - 1,
          failed: true,
        }));
      },
    );
  };
  const currentIndex = (field: AnnotationScoreFormData) =>
    getValues("scoreData").findIndex(
      (current) => annotationFieldKey(current) === annotationFieldKey(field),
    );

  // Keyboard navigation stays inside the focused annotation form.
  const formRootRef = useRef<HTMLDivElement | null>(null);

  // Real DOM focus is the single source of
  // truth: `↑`/`↓` (and `Tab`) move focus between fields, `1`-`9` pick an option
  // on the *focused* row, and the focused row is highlighted via `:focus-within`.
  const isKeyboardSelectable = (
    field: (typeof controlledFields)[number] | undefined,
  ) => {
    if (!field) return false;
    if (isTextDataType(field.dataType) || isNumericDataType(field.dataType))
      return false;
    const config = configFor(field);
    return (
      !!config && !config.isArchived && (config.categories?.length ?? 0) > 0
    );
  };

  // Counts for the keyboard legend.
  const optionRowCount = controlledFields.filter((field) =>
    isKeyboardSelectable(field),
  ).length;
  const rowCount = controlledFields.filter((field) =>
    configs.some((c) => c.id === field.configId),
  ).length;
  const hasEditableRow = controlledFields.some(
    (field) =>
      configs.some((c) => c.id === field.configId) &&
      (isTextDataType(field.dataType) || isNumericDataType(field.dataType)),
  );

  const rollbackDeleteError = (
    field: (typeof controlledFields)[number],
    previousScore: {
      id: string | null;
      value?: number | null;
      stringValue?: string | null;
      comment?: string | null;
      timestamp?: Date | null;
    },
  ) => {
    const index = currentIndex(field);
    if (index < 0) return;
    // Rollback field array
    update(index, {
      name: field.name,
      dataType: field.dataType,
      configId: field.configId,
      targetKey: field.targetKey,
      ...previousScore,
    });
    // Rollback form values directly to ensure sync
    form.setValue(`scoreData.${index}.id`, previousScore.id);
    form.setValue(`scoreData.${index}.value`, previousScore.value);
    form.setValue(`scoreData.${index}.stringValue`, previousScore.stringValue);
    form.setValue(`scoreData.${index}.comment`, previousScore.comment);
    form.setValue(`scoreData.${index}.timestamp`, previousScore.timestamp);
    if (isTextDataType(field.dataType)) {
      form.setError(`scoreData.${index}.stringValue`, {
        type: "server",
        message: "Failed to delete score",
      });
    } else {
      form.setError(`scoreData.${index}.value`, {
        type: "server",
        message: "Failed to delete score",
      });
    }
  };

  const handleDeleteScore = (index: number) => {
    const field = controlledFields[index];
    if (!field?.id) return;
    const cleared = {
      ...field,
      id: null,
      value: null,
      stringValue: null,
      comment: null,
    };
    const tracked = analytics.get(field.targetKey!)!.beginSave(
      "delete",
      cleared,
      controlledFields
        .filter((current) => current.targetKey === field.targetKey)
        .map((current) =>
          annotationFieldKey(current) === annotationFieldKey(field)
            ? cleared
            : current,
        ),
    );

    // Capture previous state for rollback
    const previousScore = {
      id: field.id,
      value: field.value,
      stringValue: field.stringValue,
      comment: field.comment,
      timestamp: field.timestamp,
    };

    // Optimistically clear form
    if (isTextDataType(field.dataType)) {
      form.clearErrors(`scoreData.${index}.stringValue`);
    } else {
      form.clearErrors(`scoreData.${index}.value`);
    }
    update(index, {
      name: field.name,
      dataType: field.dataType,
      configId: field.configId,
      targetKey: field.targetKey,
      id: null,
      value: null,
      stringValue: null,
      comment: null,
    });

    // Fire mutation with rollback
    if (previousScore.id) {
      trackSave(
        deleteMutation.mutateAsync({
          id: previousScore.id,
          projectId: targetFor(field).scoreMetadata.projectId,
        }),
        tracked,
        cleared,
        () => rollbackDeleteError(field, previousScore),
      );
    }
  };

  const rollbackUpdateError = (
    field: AnnotationScoreFormData,
    previousValue?: number | null,
    previousStringValue?: string | null,
  ) => {
    const index = currentIndex(field);
    if (index < 0) return;
    form.setValue(`scoreData.${index}.value`, previousValue);
    form.setValue(`scoreData.${index}.stringValue`, previousStringValue);
    if (isTextDataType(field.dataType)) {
      form.setError(`scoreData.${index}.stringValue`, {
        type: "server",
        message: "Failed to update score",
      });
    } else {
      form.setError(`scoreData.${index}.value`, {
        type: "server",
        message: "Failed to update score",
      });
    }
  };

  const rollbackCreateError = (
    field: AnnotationScoreFormData,
    previousValue?: number | null,
    previousStringValue?: string | null,
    previousId?: string | null,
    previousTimestamp?: Date | null,
  ) => {
    const index = currentIndex(field);
    if (index < 0) return;
    form.setValue(`scoreData.${index}.id`, previousId);
    form.setValue(`scoreData.${index}.timestamp`, previousTimestamp);
    form.setValue(`scoreData.${index}.value`, previousValue);
    form.setValue(`scoreData.${index}.stringValue`, previousStringValue);
    if (isTextDataType(field.dataType)) {
      form.setError(`scoreData.${index}.stringValue`, {
        type: "server",
        message: "Failed to create score",
      });
    } else {
      form.setError(`scoreData.${index}.value`, {
        type: "server",
        message: "Failed to create score",
      });
    }
  };

  const handleUpsert = (
    index: number,
    value: number | null,
    stringValue: string | null,
  ) => {
    const field = controlledFields[index];
    if (!field) return;

    // Capture previous form state for rollback
    const previousValue = field.value;
    const previousStringValue = field.stringValue;
    const previousId = field.id;
    const previousTimestamp = field.timestamp;
    const config = configFor(field);
    const next = {
      ...field,
      value,
      stringValue,
      id: field.id ?? uuid(),
      timestamp: field.timestamp ?? new Date(),
    };
    const categories = enrichCategoryOptionsWithStaleScoreValue(
      config?.categories ?? [],
      field.stringValue,
    );
    const control = isTextDataType(field.dataType)
      ? "text"
      : isNumericDataType(field.dataType)
        ? "number"
        : shouldUseCombobox(categories)
          ? "select"
          : "segmented";
    const tracked = analytics.get(field.targetKey!)!.beginSave(
      field.id ? "update" : "create",
      next,
      controlledFields
        .filter((current) => current.targetKey === field.targetKey)
        .map((current) =>
          annotationFieldKey(current) === annotationFieldKey(field)
            ? next
            : current,
        ),
      { control, optionCount: config?.categories?.length ?? 0 },
    );

    // Clear errors and update form optimistically
    form.clearErrors(`scoreData.${index}.value`);
    form.setValue(`scoreData.${index}.value`, value);
    form.setValue(`scoreData.${index}.stringValue`, stringValue);

    // Fire mutation
    const {
      id: scoreId,
      timestamp: scoreTimestamp,
      targetKey,
      ...fieldWithoutIdAndTimestamp
    } = field;
    const target = targets.find((target) => target.key === targetKey)!;

    const baseScoreData = {
      ...fieldWithoutIdAndTimestamp,
      ...target.scoreMetadata,
      value,
      stringValue,
      scoreTarget: target.scoreTarget,
    };

    if (scoreId) {
      trackSave(
        updateMutation.mutateAsync({
          ...baseScoreData,
          id: scoreId,
          timestamp: scoreTimestamp ?? undefined,
        } as UpdateAnnotationScoreData),
        tracked,
        next,
        () => rollbackUpdateError(field, previousValue, previousStringValue),
      );
    } else {
      const { id, timestamp } = next;
      form.setValue(`scoreData.${index}.id`, id);
      form.setValue(`scoreData.${index}.timestamp`, timestamp);
      trackSave(
        createMutation.mutateAsync({
          ...baseScoreData,
          id,
          timestamp,
        } as CreateAnnotationScoreData),
        tracked,
        next,
        () =>
          rollbackCreateError(
            field,
            previousValue,
            previousStringValue,
            previousId,
            previousTimestamp,
          ),
      );
    }
  };

  const handleNumericUpsert = (index: number) => {
    const field = controlledFields[index];
    const config = configFor(field);

    if (!config || !field) return;

    if (field.value === null || field.value === undefined) {
      // Cleared to empty: remove an existing score (mirrors the text field),
      // otherwise nothing to do.
      if (field.id) handleDeleteScore(index);
      return;
    }

    // Client-side validation - don't fire mutation if invalid
    const errorMessage = validateNumericScore({
      value: field.value,
      maxValue: config.maxValue,
      minValue: config.minValue,
    });

    if (!!errorMessage) {
      form.setError(`scoreData.${index}.value`, {
        type: "custom",
        message: errorMessage,
      });
      return;
    }

    form.clearErrors(`scoreData.${index}.value`);
    handleUpsert(index, field.value as number, null);
  };

  const handleCategoricalUpsert = (
    index: number,
    stringValue: string,
    numericValue?: number,
  ) => {
    const field = controlledFields[index];
    const config = field ? configFor(field) : undefined;

    if (!config || !field) return;

    const numericCategoryValue = resolveCategoricalNumericValue({
      categories: config.categories,
      stringValue,
      numericValue,
    });

    if (!isPresent(numericCategoryValue)) return;

    handleUpsert(index, numericCategoryValue, stringValue);
  };

  const handleTextUpsert = (index: number) => {
    const field = controlledFields[index];
    const config = field ? configFor(field) : undefined;

    if (!config || !field) return;
    if (!field.stringValue) {
      if (field.id) {
        handleDeleteScore(index);
      }
      return;
    }

    handleUpsert(index, 0, field.stringValue);
  };

  const rollbackCommentError = (
    field: (typeof controlledFields)[number],
    previousComment?: string | null,
  ) => {
    const index = currentIndex(field);
    if (index < 0) return;
    update(index, {
      ...field,
      comment: previousComment,
    });
    form.setError(`scoreData.${index}.comment`, {
      type: "server",
      message: "Failed to update comment",
    });
  };

  const handleCommentUpdate = (index: number, newComment: string | null) => {
    const field = controlledFields[index];
    if (!field || !field.id) return;
    const next = { ...field, comment: newComment };
    const tracked = analytics.get(field.targetKey!)!.beginSave(
      newComment ? "update_comment" : "delete_comment",
      next,
      controlledFields
        .filter((current) => current.targetKey === field.targetKey)
        .map((current) =>
          annotationFieldKey(current) === annotationFieldKey(field)
            ? next
            : current,
        ),
    );

    const previousComment = field.comment;

    // Optimistically update form
    update(index, {
      ...field,
      comment: newComment,
    });

    // Fire mutation
    const { targetKey, ...score } = field;
    const target = targets.find((target) => target.key === targetKey)!;
    trackSave(
      updateMutation.mutateAsync({
        ...score,
        ...target.scoreMetadata,
        scoreTarget: target.scoreTarget,
        comment: newComment,
      } as UpdateAnnotationScoreData),
      tracked,
      next,
      () => rollbackCommentError(field, previousComment),
    );
  };

  // Keyboard navigation uses real DOM focus with a
  // spreadsheet-style navigate-vs-edit split (single source of truth, one
  // outline, never trapped):
  //  - `↑` / `↓` move focus between *rows* (the row container, never into a text
  //    field) so navigation keeps working even when the active row is text.
  //  - `Enter`  drills into the focused row's control (a text/number field to
  //    type, the combobox to open, a toggle to use ←/→).
  //  - `Esc`    pops back out of an editing text field to its row.
  //  - `1`-`9`  pick the Nth option of the focused row (option rows only).
  // A focused text field owns its keys; an open popover/drawer suspends these.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (hasModifier(event)) return;

      const root = formRootRef.current;
      if (!root) return;
      // Suspend for an overlapping popover/drawer (e.g. the comment editor), but
      // NOT for a drawer this form is mounted inside (the Annotate drawer) — that
      // is an ancestor of the form, so the scheme stays alive there.
      if (hasBlockingOverlay(root)) return;
      const target = event.target;
      const editing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      // (`Esc` to leave a field is handled by a separate capture-phase listener
      // below, so it can stop a wrapping drawer from also dismissing.)

      // `Enter` in a single-line field (e.g. a numeric score) commits the value
      // and returns to row navigation — there is no newline to insert, so this is
      // the spreadsheet "confirm cell" gesture. Multi-line text (textarea) keeps
      // Enter for newlines and is excluded here.
      if (
        event.key === "Enter" &&
        target instanceof HTMLInputElement &&
        root.contains(target)
      ) {
        // Out-of-range numeric: surface the constraint and stay so the value
        // isn't committed-and-dropped (mirrors the ⌘/Ctrl+Enter complete gate).
        if (
          target.type === "number" &&
          (target.validity.rangeOverflow || target.validity.rangeUnderflow)
        ) {
          event.preventDefault();
          target.reportValidity();
          return;
        }
        event.preventDefault();
        const row = target.closest<HTMLElement>("[data-score-row]");
        // Focusing the row blurs the input (its onBlur saves) and resumes ↑/↓.
        if (row) row.focus();
        else target.blur();
        return;
      }

      // While editing a text field, leave its keys (typing, caret, number step)
      // alone — `Esc` / `Tab` move out.
      if (editing) return;
      if (rowCount === 0) return;

      // The form containing focus acts; if focus is on the body the first
      // form acts. A control focused *outside* any form (e.g. the Mark Completed
      // / Skip / Back / "?" page buttons) must NOT drive the form — otherwise
      // ↑/↓ would hijack focus off that button into the score rows.
      const active = document.activeElement;
      const focusedForm =
        active instanceof HTMLElement
          ? active.closest("[data-annotation-form]")
          : null;
      if (focusedForm) {
        if (focusedForm !== root) return;
      } else {
        if (active && active !== document.body) return;
        if (document.querySelector("[data-annotation-form]") !== root) return;
      }

      const rowEls = Array.from(
        root.querySelectorAll<HTMLElement>("[data-score-row]"),
      );
      if (rowEls.length === 0) return;
      const currentRow =
        active instanceof HTMLElement
          ? (active.closest("[data-score-row]") as HTMLElement | null)
          : null;
      const currentPos = currentRow ? rowEls.indexOf(currentRow) : -1;

      // `↑` / `↓` move focus between rows (to the row container itself, never
      // into a text field — so navigation is never trapped).
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (rowEls.length < 2) return;
        // Navigate from a focused row, or enter from the body — but NOT from an
        // in-form non-row control (e.g. the config-picker trigger), which would
        // otherwise teleport focus to a row.
        if (currentPos < 0 && active !== document.body) return;
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const nextPos =
          currentPos < 0
            ? delta > 0
              ? 0
              : rowEls.length - 1
            : (currentPos + delta + rowEls.length) % rowEls.length;
        rowEls[nextPos].focus();
        return;
      }

      // `Enter` drills into the focused row's control (only from the row
      // container itself — once a control is focused, Enter is left to it).
      if (event.key === "Enter") {
        if (currentRow && active === currentRow) {
          // First *enabled* control — skip the disabled stale-category chip that
          // enrichCategoryOptionsWithStaleScoreValue prepends (focusing a disabled
          // control is a no-op, so Enter would otherwise appear to do nothing).
          const control = Array.from(
            currentRow.querySelectorAll<HTMLElement>(
              "[data-score-control] :is(textarea, input, button)",
            ),
          ).find((el) => !el.matches(":disabled"));
          if (control) {
            event.preventDefault();
            // A dropdown trigger (combobox, `aria-haspopup`) opens directly so a
            // single Enter is enough (not focus-then-Enter). Radix's Popover
            // trigger opens on click. Other controls (number/text input, toggle)
            // just take focus.
            if (
              control.tagName === "BUTTON" &&
              control.getAttribute("aria-haspopup")
            ) {
              control.click();
            } else {
              control.focus();
            }
          }
        }
        return;
      }

      // `1`-`9` pick an option on the focused row (option rows only).
      if (/^[1-9]$/.test(event.key)) {
        if (currentPos < 0 || !currentRow) return;
        // Only from the row container itself or its value control — never the
        // in-row Comment / Delete buttons (else a stray digit writes a phantom
        // score). Mirrors the Enter branch's `active === currentRow` gate.
        if (
          active !== currentRow &&
          !(
            active instanceof HTMLElement &&
            active.closest("[data-score-control]")
          )
        )
          return;
        const rowIndex = Number(currentRow.getAttribute("data-score-row"));
        const field = controlledFields[rowIndex];
        if (!isKeyboardSelectable(field)) return;
        const config = field ? configFor(field) : undefined;
        const category = (config?.categories ?? [])[Number(event.key) - 1];
        if (!category) return;
        event.preventDefault();
        handleCategoricalUpsert(rowIndex, category.label);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledFields, configs, rowCount]);

  // `Esc` leaves a focused score field (back to its row) without
  // dismissing a wrapping drawer. Vaul/Radix DismissableLayer listens for Esc on
  // `document` with `{capture:true}`; a window capture-phase listener runs first
  // (window is the ancestor), so stopping propagation here prevents the drawer
  // from closing. Scoped to fields inside this form (a portaled comment popover
  // is not inside the form root, so its own Esc-to-close still works).
  useEffect(() => {
    const onEscapeCapture = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const root = formRootRef.current;
      if (!root) return;
      const target = event.target;
      const inField =
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement) &&
        root.contains(target);
      if (!inField) return;
      event.stopPropagation();
      const row = (target as HTMLElement).closest<HTMLElement>(
        "[data-score-row]",
      );
      if (row) row.focus();
      else (target as HTMLElement).blur();
    };
    window.addEventListener("keydown", onEscapeCapture, true);
    return () => window.removeEventListener("keydown", onEscapeCapture, true);
  }, []);

  return (
    <div
      ref={formRootRef}
      data-annotation-form
      className="ph-no-capture mx-auto w-full space-y-2 overflow-y-auto p-1 md:max-h-full"
    >
      <div className="sticky top-0 z-10 rounded-sm bg-[hsl(var(--annotation-surface,var(--background)))]">
        <AnnotateHeader
          saveStatus={saveStatus}
          actionButtons={actionButtons}
          description={description}
        />
        {allowManualSelection ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">Score fields</span>
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
            </div>
            <MultiSelectTagInput
              aria-label="Score fields"
              placeholder="Choose score fields"
              searchPlaceholder="Search score fields..."
              emptyMessage="No score fields found."
              options={selectionOptions.map((option) => ({
                ...option,
                accessibleLabel: showOptionTargets
                  ? `${option.label} (${option.targetLabel})`
                  : option.label,
                keywords: [option.targetLabel],
                optionSuffix: showOptionTargets ? (
                  <Badge variant="outline-solid" size="sm">
                    {option.targetLabel}
                  </Badge>
                ) : undefined,
                selectedSuffix: showSelectedTargets ? (
                  <Badge variant="outline-solid" size="sm">
                    {option.targetLabel}
                  </Badge>
                ) : undefined,
              }))}
              onValueChange={handleSelectionChange}
              value={selectedConfigIds}
            />
          </div>
        ) : null}
      </div>
      <Form {...form}>
        {/* No real submit: scores save per-field. Prevent the browser's implicit
            form submission (Enter in a single-line input would otherwise reload
            the page). */}
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="grid grid-flow-row gap-2.5">
            <FormField
              control={form.control}
              name="scoreData"
              render={() => (
                <>
                  {controlledFields.map((score, index) => {
                    const target = targetFor(score);
                    const config = configFor(score);
                    if (!config) return null;
                    const categories = enrichCategoryOptionsWithStaleScoreValue(
                      config.categories ?? [],
                      score.stringValue,
                    );

                    return (
                      <div
                        key={fields[index]?.id}
                        data-score-row={index}
                        // `tabIndex={-1}` makes the row programmatically focusable
                        // so ↑/↓ can land on the row itself (navigate) without
                        // entering its text field. The focused row highlights via
                        // `:focus-within` (single source of truth = real focus;
                        // `ring-inset` so the scroll container's overflow can't
                        // clip it), and `group` shows the option badges only on it.
                        tabIndex={-1}
                        role="group"
                        aria-label={
                          showSelectedTargets
                            ? `${score.name} (${target.label})`
                            : score.name
                        }
                        className={cn(
                          "group grid w-full grid-cols-[1fr_2fr] items-center gap-3 rounded-md px-3 py-1 text-left transition-colors outline-none",
                          "focus-within:ring-primary/30 focus-within:bg-accent/40 focus-within:ring-1 focus-within:ring-inset",
                        )}
                      >
                        <div className="flex h-full min-w-0 flex-col items-start justify-center gap-1">
                          <div className="flex max-w-full min-w-0 items-center gap-1">
                            {config.description ||
                            isPresent(config.maxValue) ||
                            isPresent(config.minValue) ? (
                              <HoverCard>
                                <HoverCardTrigger asChild>
                                  <span
                                    className={cn(
                                      "decoration-muted-gray line-clamp-2 min-w-0 text-xs font-bold wrap-break-word underline decoration-dashed underline-offset-2",
                                      config.isArchived
                                        ? "text-foreground/40"
                                        : "",
                                    )}
                                  >
                                    {score.name}
                                  </span>
                                </HoverCardTrigger>
                                <HoverCardContent className="z-20 max-h-[60vh] max-w-64 overflow-y-auto rounded border">
                                  <ScoreConfigDetails config={config} />
                                </HoverCardContent>
                              </HoverCard>
                            ) : (
                              <span
                                className={cn(
                                  "line-clamp-2 min-w-0 text-xs font-bold wrap-break-word",
                                  config.isArchived ? "text-foreground/40" : "",
                                )}
                                title={score.name}
                              >
                                {score.name}
                              </span>
                            )}
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="link"
                                  type="button"
                                  size="xs"
                                  title="Add or view score comment"
                                  // Center the comment icon vertically
                                  // against the score label instead of stretching
                                  // to the full (possibly multi-line) row height,
                                  // and keep it hugging the label (shrink-0) rather
                                  // than floating in the middle of the row.
                                  className="disabled:text-primary/50 flex h-auto shrink-0 items-center self-center px-0 pl-1 disabled:opacity-100"
                                  disabled={
                                    isScoreUnsaved(score.id) ||
                                    (config.isArchived && !score.comment)
                                  }
                                >
                                  {score.comment ? (
                                    <MessageCircleMore className="h-4 w-4" />
                                  ) : (
                                    <MessageCircle className="h-4 w-4" />
                                  )}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent>
                                <FormField
                                  control={form.control}
                                  name={`scoreData.${index}.comment`}
                                  render={() => (
                                    <FormItem className="space-y-4">
                                      <FormControl>
                                        <CommentField
                                          savedComment={score.comment ?? null}
                                          disabled={isInputDisabled(config)}
                                          loading={updateMutation.isPending}
                                          onSave={(newComment) => {
                                            const trimmed = newComment?.trim();
                                            handleCommentUpdate(
                                              index,
                                              trimmed || null,
                                            );
                                          }}
                                        />
                                      </FormControl>
                                      <FormMessage className="text-xs" />
                                    </FormItem>
                                  )}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          {showSelectedTargets ? (
                            <Badge variant="outline-solid" size="sm">
                              {target.label}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-[11fr_1fr] items-center py-1">
                          {/* data-score-control wraps only the value control so
                              keyboard 1-9 scoring targets it, not the in-row
                              Comment / Delete buttons. */}
                          <div data-score-control>
                            {isTextDataType(score.dataType) ? (
                              <FormField
                                control={form.control}
                                name={`scoreData.${index}.stringValue`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Textarea
                                        {...field}
                                        value={field.value ?? ""}
                                        maxLength={TEXT_SCORE_MAX_LENGTH}
                                        className="text-xs"
                                        disabled={isInputDisabled(config)}
                                        placeholder="Enter free form text..."
                                        onBlur={() => handleTextUpsert(index)}
                                      />
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                  </FormItem>
                                )}
                              />
                            ) : isNumericDataType(score.dataType) ? (
                              <FormField
                                control={form.control}
                                name={`scoreData.${index}.value`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        {...field}
                                        value={field.value ?? ""}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          // Empty → null so the field can be
                                          // cleared back to blank (returning here
                                          // instead trapped the last digit — the
                                          // form kept the old value and re-rendered
                                          // it). onBlur deletes the score when null.
                                          field.onChange(
                                            value === "" ? null : Number(value),
                                          );
                                        }}
                                        type="number"
                                        // Mirror the config range as native
                                        // constraints so out-of-range values are
                                        // catchable via the ⌘/Ctrl+Enter complete
                                        // gate's rangeOverflow/Underflow check, on
                                        // top of the existing onBlur JS validation.
                                        // `step="any"` keeps decimals valid (config
                                        // validation is range-only, not integer).
                                        min={config.minValue ?? undefined}
                                        max={config.maxValue ?? undefined}
                                        step="any"
                                        className="text-xs"
                                        disabled={isInputDisabled(config)}
                                        onBlur={() =>
                                          handleNumericUpsert(index)
                                        }
                                      />
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                  </FormItem>
                                )}
                              />
                            ) : (
                              <FormField
                                control={form.control}
                                name={`scoreData.${index}.stringValue`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <CategoricalScoreInput
                                        projectId={
                                          target.scoreMetadata.projectId
                                        }
                                        config={config}
                                        categories={categories}
                                        name={field.name}
                                        value={field.value ?? ""}
                                        disabled={isInputDisabled(config)}
                                        analyticsData={{
                                          ...target.analyticsData,
                                          targetType: getAnnotationTargetType(
                                            target.scoreTarget,
                                          ),
                                        }}
                                        onValueChange={(
                                          value,
                                          numericValue,
                                        ) => {
                                          field.onChange(value);
                                          handleCategoricalUpsert(
                                            index,
                                            value,
                                            numericValue,
                                          );
                                        }}
                                      />
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                  </FormItem>
                                )}
                              />
                            )}
                          </div>
                          {config.isArchived ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="link"
                                  type="button"
                                  className="px-0 pl-1"
                                  title="Delete archived score"
                                  disabled={isScoreUnsaved(score.id)}
                                >
                                  <Archive className="h-4 w-4"></Archive>
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent>
                                <h2 className="mb-3 font-bold">
                                  Your score is archived
                                </h2>
                                <p className="mb-3 text-sm">
                                  This action will delete your score
                                  irreversibly.
                                </p>
                                <div className="flex justify-end space-x-4">
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    loading={deleteMutation.isPending}
                                    onClick={() => handleDeleteScore(index)}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <Button
                              variant="link"
                              type="button"
                              className="px-0 pl-1"
                              title="Delete score from trace/observation"
                              disabled={
                                isScoreUnsaved(score.id) ||
                                updateMutation.isPending
                              }
                              loading={
                                deleteMutation.isPending &&
                                !isScoreUnsaved(score.id)
                              }
                              onClick={() => handleDeleteScore(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            />
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
      </Form>
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

  // Step 1: Transform server scores to annotation scores
  const serverAnnotationScores = useMemo(() => {
    if (Array.isArray(serverScores)) {
      // Flat scores from trace/session detail
      return transformToAnnotationScores(serverScores, availableConfigs);
    }
    // Aggregates from compare view
    return transformToAnnotationScores(
      serverScores,
      availableConfigs,
      scoreTarget.type === "trace" ? scoreTarget.traceId : "",
      scoreTarget.type === "trace" ? scoreTarget.observationId : undefined,
    );
  }, [serverScores, availableConfigs, scoreTarget]);

  // Step 2: Merge with cache
  const annotationScores = useMergedAnnotationScores(
    serverAnnotationScores,
    scoreTarget,
  );

  const initialFormData: AnnotationScoreFormData[] = [];
  const configIds = new Set<string>();
  annotationScores.forEach((score) => {
    configIds.add(score.configId);
    initialFormData.push({
      id: score.id,
      configId: score.configId,
      name: score.name,
      dataType: score.dataType,
      value: score.value,
      stringValue: score.stringValue,
      comment: score.comment,
      timestamp: score.timestamp,
    });
  });

  selectedConfigIds.forEach((configId) => {
    if (!configIds.has(configId)) {
      const config = availableConfigs.find((c) => c.id === configId);
      if (!config) return;
      initialFormData.push({
        id: null,
        configId,
        name: config.name,
        dataType: config.dataType,
        value: null,
        stringValue: null,
        comment: null,
        timestamp: null,
      });
    }
  });

  const sortedInitialFormData = initialFormData.sort((a, b) =>
    a.name.localeCompare(b.name),
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
      label:
        getAnnotationTargetType(scoreTarget) === "observation"
          ? "Observation"
          : scoreTarget.type === "session"
            ? "Session"
            : "Trace",
      scoreTarget,
      initialFormData: sortedInitialFormData,
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
    />
  );
}
