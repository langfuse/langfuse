import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import {
  MessageCircleMore,
  MessageCircle,
  X,
  Archive,
  Check,
  Trash,
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
  type ScoreConfigCategoryDomain,
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
import { Combobox } from "@/src/components/ui/combobox";
import { Textarea } from "@/src/components/ui/textarea";
import { HoverCardContent } from "@radix-ui/react-hover-card";
import { HoverCard, HoverCardTrigger } from "@/src/components/ui/hover-card";
import {
  formatAnnotateDescription,
  isTextDataType,
  isNumericDataType,
  isScoreUnsaved,
} from "@/src/features/scores/lib/helpers";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import Header from "@/src/components/layouts/header";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";
import {
  type AnnotationScoreFormData,
  type InnerAnnotationFormProps,
  type ScoreTarget,
  type AnnotationForm as AnnotationFormType,
} from "@/src/features/scores/types";
import { AnnotateFormSchema } from "@/src/features/scores/schema";
import { ScoreConfigDetails } from "@/src/features/score-configs/components/ScoreConfigDetails";
import {
  enrichCategoryOptionsWithStaleScoreValue,
  resolveConfigValue,
  validateNumericScore,
} from "@/src/features/scores/lib/annotationFormHelpers";
import { useMergedAnnotationScores } from "@/src/features/scores/lib/useMergedAnnotationScores";
import { transformToAnnotationScores } from "@/src/features/scores/lib/transformScores";
import { v4 as uuid } from "uuid";
import { useScoreMutations } from "@/src/features/scores/hooks/useScoreMutations";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";
import { useScoreConfigSelection } from "@/src/features/scores/hooks/useScoreConfigSelection";
import { KeyboardShortcut } from "@/src/components/ui/keyboard-shortcut";
import {
  hasBlockingOverlay,
  hasModifier,
} from "@/src/features/scores/lib/keyboardShortcuts";
import { useRouter } from "next/router";
import { useAnnotationScoreConfigs } from "@/src/features/scores/hooks/useScoreConfigs";
import { Skeleton } from "@/src/components/ui/skeleton";
import Spinner from "@/src/components/design-system/Spinner/Spinner";

const CHAR_CUTOFF = 6;

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

const renderSelect = (categories: ScoreConfigCategoryDomain[]) => {
  const hasMoreThanThreeCategories = categories.length > 3;
  const hasLongCategoryNames = categories.some(
    ({ label }) => label.length > CHAR_CUTOFF,
  );

  return (
    hasMoreThanThreeCategories ||
    (categories.length > 1 && hasLongCategoryNames)
  );
};

function AnnotateHeader({
  showSaving,
  actionButtons,
  description,
}: {
  showSaving: boolean;
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
        <div className="flex items-center justify-end" key="saving-spinner">
          <div className="mr-1 items-center justify-center">
            {showSaving ? (
              <Spinner size="xxs" />
            ) : (
              <Check className="h-3 w-3" />
            )}
          </div>
          <span className="text-muted-foreground text-xs">
            {showSaving ? "Saving score data" : "Score data saved"}
          </span>
        </div>,
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

function InnerAnnotationForm<Target extends ScoreTarget>({
  scoreTarget,
  initialFormData,
  scoreMetadata,
  analyticsData,
  actionButtons,
  configControl,
}: InnerAnnotationFormProps<Target>) {
  const capture = usePostHogClientCapture();
  const router = useRouter();
  const { configs, allowManualSelection } = configControl;

  // Initialize form with initial data (never updates)
  const form = useForm({
    resolver: zodResolver(AnnotateFormSchema),
    defaultValues: { scoreData: initialFormData },
  });

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

  const description = formatAnnotateDescription(scoreTarget);

  // Mutations - write to cache but form doesn't consume cache updates
  const { createMutation, updateMutation, deleteMutation } = useScoreMutations({
    scoreTarget,
    scoreMetadata,
  });

  // Config selection
  const { selectionOptions, handleSelectionChange } = useScoreConfigSelection({
    configs,
    controlledFields,
    isInputDisabled,
    insert,
    remove,
    emptySelectedConfigIdsStorageKey:
      configControl.emptySelectedConfigIdsStorageKey,
  });

  const [showSaving, setShowSaving] = useState(false);

  // LFE-7628 — root of this form, used to scope the global keydown listener so
  // it doesn't double-fire across multiple mounted forms (DualAnnotationContent
  // mounts an observation form and a trace form side-by-side).
  const formRootRef = useRef<HTMLDivElement | null>(null);

  // LFE-7628 — keyboard-first scoring. Real DOM focus is the single source of
  // truth: `↑`/`↓` (and `Tab`) move focus between fields, `1`-`9` pick an option
  // on the *focused* row, and the focused row is highlighted via `:focus-within`.
  // There is deliberately no parallel "active row" state — it previously fought
  // the browser's own focus (a focused True/False toggle showed two outlines and
  // arrows moved both the field and the toggle at once).
  const isKeyboardSelectable = (
    field: (typeof controlledFields)[number] | undefined,
  ) => {
    if (!field) return false;
    if (isTextDataType(field.dataType) || isNumericDataType(field.dataType))
      return false;
    const config = configs.find((c) => c.id === field.configId);
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

  useEffect(() => {
    const isPending =
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending;
    setShowSaving(isPending);
  }, [
    createMutation.isPending,
    updateMutation.isPending,
    deleteMutation.isPending,
  ]);

  const rollbackDeleteError = (
    index: number,
    field: (typeof controlledFields)[number],
    previousScore: {
      id: string | null;
      value?: number | null;
      stringValue?: string | null;
      comment?: string | null;
      timestamp?: Date | null;
    },
  ) => {
    // Rollback field array
    update(index, {
      name: field.name,
      dataType: field.dataType,
      configId: field.configId,
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
      id: null,
      value: null,
      stringValue: null,
      comment: null,
    });

    // Fire mutation with rollback
    if (previousScore.id) {
      deleteMutation.mutate(
        {
          id: previousScore.id,
          projectId: scoreMetadata.projectId,
        },
        {
          onError: () => rollbackDeleteError(index, field, previousScore),
        },
      );
    }

    // Capture delete event
    capture("score:delete", analyticsData);
  };

  const rollbackUpdateError = (
    index: number,
    previousValue?: number | null,
    previousStringValue?: string | null,
  ) => {
    form.setValue(`scoreData.${index}.value`, previousValue);
    form.setValue(`scoreData.${index}.stringValue`, previousStringValue);
    if (isTextDataType(controlledFields[index]?.dataType)) {
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
    index: number,
    previousValue?: number | null,
    previousStringValue?: string | null,
    previousId?: string | null,
    previousTimestamp?: Date | null,
  ) => {
    form.setValue(`scoreData.${index}.id`, previousId);
    form.setValue(`scoreData.${index}.timestamp`, previousTimestamp);
    form.setValue(`scoreData.${index}.value`, previousValue);
    form.setValue(`scoreData.${index}.stringValue`, previousStringValue);
    if (isTextDataType(controlledFields[index]?.dataType)) {
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

    // Clear errors and update form optimistically
    form.clearErrors(`scoreData.${index}.value`);
    form.setValue(`scoreData.${index}.value`, value);
    form.setValue(`scoreData.${index}.stringValue`, stringValue);

    // Fire mutation
    const {
      id: scoreId,
      timestamp: scoreTimestamp,
      ...fieldWithoutIdAndTimestamp
    } = field;

    const baseScoreData = {
      ...fieldWithoutIdAndTimestamp,
      ...scoreMetadata,
      value,
      stringValue,
      scoreTarget,
    };

    if (scoreId) {
      updateMutation.mutate(
        {
          ...baseScoreData,
          id: scoreId,
          timestamp: scoreTimestamp ?? undefined,
        } as UpdateAnnotationScoreData,
        {
          onError: () =>
            rollbackUpdateError(index, previousValue, previousStringValue),
        },
      );
    } else {
      const id = uuid();
      const timestamp = new Date();
      form.setValue(`scoreData.${index}.id`, id);
      form.setValue(`scoreData.${index}.timestamp`, timestamp);
      createMutation.mutate(
        {
          ...baseScoreData,
          id,
          timestamp,
        } as CreateAnnotationScoreData,
        {
          onError: () =>
            rollbackCreateError(
              index,
              previousValue,
              previousStringValue,
              previousId,
              previousTimestamp,
            ),
        },
      );
    }
  };

  const handleNumericUpsert = (index: number) => {
    const field = controlledFields[index];
    const config = configs.find((c) => c.id === field.configId);

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

  const handleCategoricalUpsert = (index: number, stringValue: string) => {
    const field = controlledFields[index];
    const config = configs.find((c) => c.id === field.configId);

    if (!config || !field) return;

    const numericCategoryValue = config.categories?.find(
      ({ label }) => label === stringValue,
    )?.value;

    if (!isPresent(numericCategoryValue)) return;

    handleUpsert(index, numericCategoryValue, stringValue);
  };

  const handleTextUpsert = (index: number) => {
    const field = controlledFields[index];
    const config = configs.find((c) => c.id === field.configId);

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
    index: number,
    field: (typeof controlledFields)[number],
    previousComment?: string | null,
  ) => {
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

    const previousComment = field.comment;

    // Optimistically update form
    update(index, {
      ...field,
      comment: newComment,
    });

    // Fire mutation
    updateMutation.mutate(
      {
        ...field,
        ...scoreMetadata,
        scoreTarget,
        comment: newComment,
      } as UpdateAnnotationScoreData,
      {
        onError: () => rollbackCommentError(index, field, previousComment),
      },
    );
  };

  // LFE-7628 — keyboard-first scoring, driven by real DOM focus with a
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

      // Scope to a single form (DualAnnotationContent mounts two): the form that
      // contains focus acts; if focus is on the body (nothing focused) the first
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
        const config = configs.find((c) => c.id === field?.configId);
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

  // LFE-7628 — `Esc` leaves a focused score field (back to its row) WITHOUT
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
      className="mx-auto w-full space-y-2 overflow-y-auto md:max-h-full"
    >
      <div className="bg-background sticky top-0 z-10 rounded-sm">
        <AnnotateHeader
          showSaving={showSaving}
          actionButtons={actionButtons}
          description={description}
        />
        {allowManualSelection ? (
          <div className="grid grid-flow-col items-center">
            <MultiSelectKeyValues
              placeholder="Value"
              align="end"
              items="empty scores"
              className="grid grid-cols-[auto_1fr_auto_auto] gap-2"
              options={selectionOptions}
              onValueChange={handleSelectionChange}
              values={fields
                .filter((field) => !!field.configId)
                .map((field) => ({
                  key: field.configId as string,
                  value: resolveConfigValue({
                    dataType: field.dataType,
                    name: field.name,
                  }),
                }))}
              controlButtons={
                <DropdownMenuItem
                  onSelect={() => {
                    capture(
                      "score_configs:manage_configs_item_click",
                      analyticsData,
                    );
                    router.push(
                      `/project/${scoreMetadata.projectId}/settings/scores`,
                    );
                  }}
                >
                  Manage score configs
                </DropdownMenuItem>
              }
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
                    const config = configs.find(
                      (config) => config.id === score.configId,
                    );
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
                        aria-label={score.name}
                        className={cn(
                          "group grid w-full grid-cols-[1fr_2fr] items-center gap-3 rounded-md px-3 py-1 text-left transition-colors outline-none",
                          "focus-within:ring-primary/30 focus-within:bg-accent/40 focus-within:ring-1 focus-within:ring-inset",
                        )}
                      >
                        <div className="flex h-full min-w-0 items-center">
                          {config.description ||
                          isPresent(config.maxValue) ||
                          isPresent(config.minValue) ? (
                            <HoverCard>
                              <HoverCardTrigger asChild>
                                <span
                                  className={cn(
                                    "decoration-muted-gray line-clamp-2 min-w-0 text-xs font-medium wrap-break-word underline decoration-dashed underline-offset-2",
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
                                "line-clamp-2 min-w-0 text-xs font-medium wrap-break-word",
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
                                // LFE-7628: center the comment icon vertically
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
                            ) : config.categories &&
                              renderSelect(categories) ? (
                              <FormField
                                control={form.control}
                                name={`scoreData.${index}.stringValue`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Combobox
                                        name={field.name}
                                        value={field.value ?? ""}
                                        disabled={isInputDisabled(config)}
                                        onValueChange={(value) => {
                                          field.onChange(value);
                                          handleCategoricalUpsert(index, value);
                                        }}
                                        options={categories.map((category) => ({
                                          value: category.label,
                                          disabled: category.isOutdated,
                                        }))}
                                        placeholder="Select category"
                                        searchPlaceholder="Search categories..."
                                        emptyText="No category found."
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
                                      <ToggleGroup
                                        type="single"
                                        // Horizontal roving so Radix only uses
                                        // ←/→ between True/False, leaving ↑/↓ for
                                        // our field navigation (no double-handling).
                                        orientation="horizontal"
                                        value={field.value ?? ""}
                                        disabled={isInputDisabled(config)}
                                        className={`grid grid-cols-${categories.length}`}
                                        onValueChange={(value) => {
                                          field.onChange(value);
                                          handleCategoricalUpsert(index, value);
                                        }}
                                      >
                                        {categories.map((category) =>
                                          category.isOutdated ? (
                                            <ToggleGroupItem
                                              key={category.value}
                                              value={category.label}
                                              disabled
                                              variant="outline"
                                              className="grid grid-flow-col gap-1 px-1 text-xs font-normal text-nowrap opacity-50"
                                            >
                                              <span
                                                className="truncate"
                                                title={category.label}
                                              >
                                                {category.label}
                                              </span>
                                              <span>{`(${category.value})`}</span>
                                            </ToggleGroupItem>
                                          ) : (
                                            <ToggleGroupItem
                                              key={category.value}
                                              value={category.label}
                                              variant="outline"
                                              className="grid grid-flow-col gap-1 px-1 text-xs font-normal text-nowrap"
                                            >
                                              <span
                                                className="truncate"
                                                title={category.label}
                                              >
                                                {category.label}
                                              </span>
                                              {(() => {
                                                // LFE-7628: number-key hint for this
                                                // option, shown only while the row is
                                                // focused (CSS `group-focus-within`,
                                                // so it tracks real focus directly).
                                                const digit =
                                                  (config.categories?.findIndex(
                                                    (c) =>
                                                      c.label ===
                                                      category.label,
                                                  ) ?? -1) + 1;
                                                return digit >= 1 &&
                                                  digit <= 9 ? (
                                                  <KeyboardShortcut className="ml-0.5 hidden h-3.5 min-w-3.5 px-1 text-[9px] group-focus-within:inline-flex">
                                                    {digit}
                                                  </KeyboardShortcut>
                                                ) : null;
                                              })()}
                                            </ToggleGroupItem>
                                          ),
                                        )}
                                      </ToggleGroup>
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
                                <h2 className="mb-3 font-semibold">
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
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 px-0.5 text-[11px]">
              {rowCount > 1 && (
                <span className="flex items-center gap-1">
                  <KeyboardShortcut className="h-4 min-w-4 px-1 text-[9px]">
                    ↑
                  </KeyboardShortcut>
                  <KeyboardShortcut className="h-4 min-w-4 px-1 text-[9px]">
                    ↓
                  </KeyboardShortcut>
                  move between fields
                </span>
              )}
              {optionRowCount > 0 && (
                <span className="flex items-center gap-1">
                  <KeyboardShortcut className="h-4 min-w-4 px-1 text-[9px]">
                    1
                  </KeyboardShortcut>
                  <span className="text-muted-foreground">…</span>
                  <KeyboardShortcut className="h-4 min-w-4 px-1 text-[9px]">
                    9
                  </KeyboardShortcut>
                  select option
                </span>
              )}
              {hasEditableRow && (
                <span className="flex items-center gap-1">
                  <KeyboardShortcut className="h-4 px-1 text-[9px]">
                    ↵
                  </KeyboardShortcut>
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

export function AnnotationForm<Target extends ScoreTarget>({
  scoreTarget,
  serverScores,
  scoreMetadata,
  analyticsData,
  actionButtons,
  configSelection = { mode: "selectable" },
}: AnnotationFormType<Target>) {
  const { projectId } = scoreMetadata;
  const emptySelectedConfigIdsStorageKey =
    getEmptySelectedConfigIdsStorageKey(scoreTarget);
  const { isLoading, availableConfigs, selectedConfigIds } =
    useAnnotationScoreConfigs({
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

  return isLoading ? (
    <Skeleton className="h-full w-full" />
  ) : (
    <InnerAnnotationForm
      scoreTarget={scoreTarget}
      initialFormData={sortedInitialFormData}
      scoreMetadata={scoreMetadata}
      analyticsData={analyticsData}
      actionButtons={actionButtons}
      configControl={{
        configs: availableConfigs,
        allowManualSelection: configSelection.mode === "selectable",
        emptySelectedConfigIdsStorageKey,
      }}
    />
  );
}
