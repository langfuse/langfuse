import React, { useRef, useState } from "react";
import { useFormState, useWatch, type UseFormReturn } from "react-hook-form";
import { useStore } from "zustand";
import {
  isPresent,
  TEXT_SCORE_MAX_LENGTH,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import {
  MessageCircleMore,
  MessageCircle,
  MoreHorizontal,
  Trash,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { HoverCardContent } from "@radix-ui/react-hover-card";
import { HoverCard, HoverCardTrigger } from "@/src/components/ui/hover-card";
import { Badge } from "@/src/components/ui/badge";
import {
  DropdownMenuController,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/src/components/ui/dropdown-menu";
import { ScoreConfigDetails } from "@/src/features/score-configs/components/ScoreConfigDetails";
import { CategoricalScoreInput } from "@/src/features/scores/components/CategoricalScoreInput";
import {
  isTextDataType,
  isNumericDataType,
  isScoreUnsaved,
} from "@/src/features/scores/lib/helpers";
import { enrichCategoryOptionsWithStaleScoreValue } from "@/src/features/scores/lib/annotationFormHelpers";
import { getAnnotationTargetType } from "@/src/features/scores/lib/annotationAnalytics";
import type { AnnotationFormActions } from "@/src/features/scores/actions/annotationFormActions";
import type {
  AnnotateFormSchemaType,
  PreparedAnnotationTarget,
} from "@/src/features/scores/types";
import { cn } from "@/src/utils/tailwind";

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

export function AnnotationScoreRow({
  form,
  actions,
  index,
  fieldKey,
  target,
  config,
  showTarget,
  formRootRef,
  commentSaving,
  targetOptions,
}: {
  form: UseFormReturn<AnnotateFormSchemaType>;
  actions: AnnotationFormActions;
  index: number;
  fieldKey: string;
  target: PreparedAnnotationTarget;
  config: ScoreConfigDomain;
  showTarget: boolean;
  formRootRef: React.RefObject<HTMLDivElement | null>;
  commentSaving: boolean;
  targetOptions: { target: PreparedAnnotationTarget; hasField: boolean }[];
}) {
  const score = useWatch({ control: form.control, name: `scoreData.${index}` });
  const fieldState = useFormState({
    control: form.control,
    name: `scoreData.${index}`,
  });
  const saving = useStore(actions.saveStore, (state) => state.pending > 0);
  const categories = enrichCategoryOptionsWithStaleScoreValue(
    config.categories ?? [],
    score.stringValue,
  );
  const rowRef = useRef<HTMLDivElement | null>(null);
  const deferredInput = useRef<HTMLInputElement | HTMLTextAreaElement | null>(
    null,
  );
  const focusFieldKey = useRef(fieldKey);
  const hasScoreValue = Boolean(
    score.id || isPresent(score.value) || score.stringValue || score.comment,
  );
  const invalid =
    form.getFieldState(`scoreData.${index}.value`, fieldState).invalid ||
    form.getFieldState(`scoreData.${index}.stringValue`, fieldState).invalid;
  const isMovingToScoreActions = (
    event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const next = event.relatedTarget;
    const row = rowRef.current;
    const ownActions =
      row &&
      ((next instanceof HTMLElement &&
        row.contains(next) &&
        next.closest("[data-score-actions]")) ||
        row.querySelector('[data-score-actions][data-state="open"]'));
    if (!ownActions) return false;
    deferredInput.current = event.currentTarget;
    return true;
  };
  const commitDeferredScore = () => {
    const input = deferredInput.current;
    deferredInput.current = null;
    if (input instanceof HTMLInputElement)
      actions.saveNumeric(fieldKey, target, input);
    else if (input) actions.saveText(fieldKey, target);
  };
  return (
    <Form {...form} formState={fieldState}>
      <div
        ref={rowRef}
        data-score-row={index}
        // `tabIndex={-1}` makes the row programmatically focusable
        // so ↑/↓ can land on the row itself (navigate) without
        // entering its text field. The focused row highlights via
        // `:focus-within` (single source of truth = real focus;
        // `ring-inset` so the scroll container's overflow can't
        // clip it), and `group` shows the option badges only on it.
        tabIndex={-1}
        role="group"
        aria-label={showTarget ? `${score.name} (${target.label})` : score.name}
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
                      config.isArchived ? "text-foreground/40" : "",
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
                          disabled={config.isArchived}
                          loading={commentSaving}
                          onSave={(newComment) => {
                            const trimmed = newComment?.trim();
                            actions.saveComment(
                              fieldKey,
                              target,
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
          {showTarget ? (
            <Badge variant="outline-solid" size="sm">
              {target.label}
            </Badge>
          ) : null}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-1 py-1">
          {/* data-score-control wraps only the value control so
                              keyboard 1-9 scoring targets it, not the in-row
                              comment or score actions. */}
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
                        disabled={config.isArchived}
                        placeholder="Enter free form text..."
                        onBlur={(event) => {
                          field.onBlur();
                          if (!isMovingToScoreActions(event))
                            actions.saveText(fieldKey, target);
                        }}
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            ) : null}
            {isNumericDataType(score.dataType) ? (
              <FormField
                control={form.control}
                name={`scoreData.${index}.value`}
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        onChange={(event) => {
                          const value = event.currentTarget.valueAsNumber;
                          field.onChange(Number.isFinite(value) ? value : null);
                        }}
                        onInput={(event) =>
                          actions.validateNumericInput(
                            fieldKey,
                            target,
                            event.currentTarget,
                          )
                        }
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
                        className="aria-invalid:border-destructive text-xs"
                        disabled={config.isArchived}
                        onBlur={(event) => {
                          field.onBlur();
                          if (!isMovingToScoreActions(event))
                            actions.saveNumeric(
                              fieldKey,
                              target,
                              event.currentTarget,
                            );
                        }}
                      />
                    </FormControl>
                    <FormMessage className="text-xs leading-snug font-normal" />
                  </FormItem>
                )}
              />
            ) : null}
            {!isTextDataType(score.dataType) &&
            !isNumericDataType(score.dataType) ? (
              <FormField
                control={form.control}
                name={`scoreData.${index}.stringValue`}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <CategoricalScoreInput
                        projectId={target.scoreMetadata.projectId}
                        config={config}
                        categories={categories}
                        name={field.name}
                        value={field.value ?? ""}
                        disabled={config.isArchived}
                        analyticsData={{
                          ...target.analyticsData,
                          targetType: getAnnotationTargetType(
                            target.scoreTarget,
                          ),
                        }}
                        onValueChange={(value, numericValue) =>
                          actions.saveCategory(
                            fieldKey,
                            target,
                            value,
                            numericValue,
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            ) : null}
          </div>
          {hasScoreValue || invalid || targetOptions.length > 0 ? (
            <DropdownMenuController
              align="end"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                const nextFocus = focusFieldKey.current;
                focusFieldKey.current = fieldKey;
                commitDeferredScore();
                formRootRef.current
                  ?.querySelector<HTMLElement>(
                    `[data-score-row="${actions.indexOf(nextFocus)}"]`,
                  )
                  ?.focus();
              }}
              renderMenu={() => (
                <>
                  {targetOptions.length > 0 ? (
                    <>
                      <DropdownMenuLabel>
                        Applies to: {target.label}
                      </DropdownMenuLabel>
                      {score.id ? (
                        <div className="text-muted-foreground px-2 pb-2 text-xs">
                          This score is saved on the{" "}
                          {target.label.toLowerCase()} and cannot be moved.
                        </div>
                      ) : (
                        targetOptions.map(
                          ({ target: destination, hasField }) => (
                            <DropdownMenuItem
                              key={destination.key}
                              disabled={
                                saving ||
                                invalid ||
                                hasField ||
                                config.isArchived
                              }
                              onSelect={() => {
                                const input = deferredInput.current;
                                deferredInput.current = null;
                                const nextKey = actions.changeDraftTarget(
                                  fieldKey,
                                  destination,
                                );
                                if (nextKey) focusFieldKey.current = nextKey;
                                else deferredInput.current = input;
                              }}
                            >
                              Score {destination.label.toLowerCase()} instead
                              {hasField ? " (already selected)" : ""}
                            </DropdownMenuItem>
                          ),
                        )
                      )}
                      {targetOptions.map(
                        ({ target: destination, hasField }) => (
                          <DropdownMenuItem
                            key={`add-${destination.key}`}
                            disabled={hasField || config.isArchived}
                            onSelect={() => {
                              commitDeferredScore();
                              const nextKey = actions.addDraftTarget(
                                fieldKey,
                                destination,
                              );
                              if (nextKey) focusFieldKey.current = nextKey;
                            }}
                          >
                            Also score {destination.label.toLowerCase()}
                            {hasField ? " (already selected)" : ""}
                          </DropdownMenuItem>
                        ),
                      )}
                    </>
                  ) : null}
                  {(hasScoreValue || invalid) && targetOptions.length > 0 ? (
                    <DropdownMenuSeparator />
                  ) : null}
                  {hasScoreValue || invalid ? (
                    <DropdownMenuItem
                      disabled={saving}
                      onSelect={() => {
                        deferredInput.current = null;
                        actions.clear(fieldKey, target);
                      }}
                    >
                      Clear score
                    </DropdownMenuItem>
                  ) : null}
                </>
              )}
            >
              {({ Trigger }) => (
                <Trigger asChild>
                  <Button
                    variant="ghost"
                    type="button"
                    size="icon-xs"
                    data-score-actions
                    onBlur={(event) => {
                      if (event.currentTarget.dataset.state !== "open")
                        commitDeferredScore();
                    }}
                    aria-label={`Score actions for ${score.name}${showTarget ? ` (${target.label})` : ""}`}
                    title="Score actions"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </Trigger>
              )}
            </DropdownMenuController>
          ) : null}
        </div>
      </div>
    </Form>
  );
}
