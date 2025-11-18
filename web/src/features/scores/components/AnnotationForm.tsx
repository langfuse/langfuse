import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/src/components/ui/button";
import {
  MessageCircleMore,
  MessageCircle,
  X,
  Archive,
  Loader2,
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
import { useRouter } from "next/router";
import { useAnnotationScoreConfigs } from "@/src/features/scores/hooks/useScoreConfigs";
import { Skeleton } from "@/src/components/ui/skeleton";

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
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
          </div>
          <span className="text-xs text-muted-foreground">
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
  });

  const [showSaving, setShowSaving] = useState(false);

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
    form.setError(`scoreData.${index}.value`, {
      type: "server",
      message: "Failed to delete score",
    });
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
    form.clearErrors(`scoreData.${index}.value`);
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
    form.setError(`scoreData.${index}.value`, {
      type: "server",
      message: "Failed to update score",
    });
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
    form.setError(`scoreData.${index}.value`, {
      type: "server",
      message: "Failed to create score",
    });
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
      return; // Don't create/update score with empty value
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

  return (
    <div className="mx-auto w-full space-y-2 overflow-y-auto md:max-h-full">
      <div className="sticky top-0 z-10 rounded-sm bg-background">
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
              className="grid grid-cols-[auto,1fr,auto,auto] gap-2"
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
        <form className="flex flex-col gap-4">
          <div className="grid grid-flow-row gap-2">
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
                        className="grid w-full grid-cols-[1fr,2fr] items-center gap-8 text-left"
                      >
                        <div className="grid h-full grid-cols-[1fr,auto] items-center">
                          {config.description ||
                          isPresent(config.maxValue) ||
                          isPresent(config.minValue) ? (
                            <HoverCard>
                              <HoverCardTrigger asChild>
                                <span
                                  className={cn(
                                    "line-clamp-2 break-words text-xs font-medium underline decoration-muted-gray decoration-dashed underline-offset-2",
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
                                "line-clamp-2 break-words text-xs font-medium",
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
                                className="h-full items-start px-0 pl-1 disabled:text-primary/50 disabled:opacity-100"
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
                        <div className="grid grid-cols-[11fr,1fr] items-center py-1">
                          {isNumericDataType(score.dataType) ? (
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
                                        if (value === "") {
                                          return;
                                        }
                                        field.onChange(Number(value));
                                      }}
                                      type="number"
                                      className="text-xs"
                                      disabled={isInputDisabled(config)}
                                      onBlur={() => handleNumericUpsert(index)}
                                    />
                                  </FormControl>
                                  <FormMessage className="text-xs" />
                                </FormItem>
                              )}
                            />
                          ) : config.categories && renderSelect(categories) ? (
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
                                            className="grid grid-flow-col gap-1 text-nowrap px-1 text-xs font-normal opacity-50"
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
                                            className="grid grid-flow-col gap-1 text-nowrap px-1 text-xs font-normal"
                                          >
                                            <span
                                              className="truncate"
                                              title={category.label}
                                            >
                                              {category.label}
                                            </span>
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
                                <h2 className="text-md mb-3 font-semibold">
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
  const { isLoading, availableConfigs, selectedConfigIds } =
    useAnnotationScoreConfigs({
      projectId,
      configSelection,
    });

  // Step 1: Transform server scores to annotation scores
  const serverAnnotationScores = useMemo(() => {
    if (Array.isArray(serverScores)) {
      // Flat scores from trace/session detail
      return transformToAnnotationScores(serverScores, availableConfigs);
    } else {
      // Aggregates from compare view
      return transformToAnnotationScores(
        serverScores,
        availableConfigs,
        scoreTarget.type === "trace" ? scoreTarget.traceId : "",
        scoreTarget.type === "trace" ? scoreTarget.observationId : undefined,
      );
    }
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
      }}
    />
  );
}
