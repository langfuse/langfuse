import React, { useEffect, useRef } from "react";
import { Button } from "@/src/components/ui/button";
import {
  MessageCircleMore,
  MessageCircle,
  X,
  Archive,
  Loader2,
  Check,
} from "lucide-react";
import {
  type ControllerRenderProps,
  useFieldArray,
  useForm,
  type ErrorOption,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { DrawerHeader, DrawerTitle } from "@/src/components/ui/drawer";
import {
  type APIScoreV2,
  isPresent,
  CreateAnnotationScoreData,
  UpdateAnnotationScoreData,
  type ValidatedScoreConfig,
  type ConfigCategory,
} from "@langfuse/shared";
import { Input } from "@/src/components/ui/input";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { HoverCardContent } from "@radix-ui/react-hover-card";
import { HoverCard, HoverCardTrigger } from "@/src/components/ui/hover-card";
import { ScoreConfigDetails } from "@/src/features/scores/components/ScoreConfigDetails";
import {
  formatAnnotateDescription,
  isNumericDataType,
  isScoreUnsaved,
} from "@/src/features/scores/lib/helpers";
import { getDefaultAnnotationScoreData } from "@/src/features/scores/lib/getDefaultScoreData";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import Header from "@/src/components/layouts/header";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { useRouter } from "next/router";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";
import { getScoreDataTypeIcon } from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";
import {
  type ScoreTarget,
  type AnnotateDrawerProps,
  type AnnotateFormSchemaType,
  type AnnotationScoreSchemaType,
} from "@/src/features/scores/types";
import { useScoreValues } from "@/src/features/scores/hooks/useScoreValues";
import { useScoreMutations } from "@/src/features/scores/hooks/useScoreMutations";
import { AnnotateFormSchema } from "@/src/features/scores/schema";

const CHAR_CUTOFF = 6;

const renderSelect = (categories: ConfigCategory[]) => {
  const hasMoreThanThreeCategories = categories.length > 3;
  const hasLongCategoryNames = categories.some(
    ({ label }) => label.length > CHAR_CUTOFF,
  );

  return (
    hasMoreThanThreeCategories ||
    (categories.length > 1 && hasLongCategoryNames)
  );
};

const getFormError = ({
  value,
  minValue,
  maxValue,
}: {
  value?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
}): ErrorOption | null => {
  if (
    (isPresent(maxValue) && Number(value) > maxValue) ||
    (isPresent(minValue) && Number(value) < minValue)
  ) {
    return {
      type: "custom",
      message: `Not in range: [${minValue ?? "-∞"},${maxValue ?? "∞"}]`,
    };
  }
  return null;
};

function handleOnKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") {
    e.preventDefault();
    const form = e.currentTarget.form;
    if (!form) return;

    const currentTabIndex = e.currentTarget.tabIndex;
    const nextElement = form.querySelector(
      `[tabindex="${currentTabIndex + 1}"]`,
    );

    if (nextElement instanceof HTMLElement) {
      nextElement.focus();
    } else {
      e.currentTarget.blur();
    }
  }
}

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
        href: "https://langfuse.com/docs/scores/manually",
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

type AnnotateDrawerContentProps<Target extends ScoreTarget> =
  AnnotateDrawerProps<Target> & {
    configs: ValidatedScoreConfig[];
    isDrawerOpen: boolean;
    showSaving: boolean;
    setShowSaving: (showSaving: boolean) => void;
    isSelectHidden?: boolean;
    queueId?: string;
    actionButtons?: React.ReactNode;
  };

export function AnnotateDrawerContent<Target extends ScoreTarget>({
  scoreTarget,
  scores,
  configs,
  analyticsData,
  emptySelectedConfigIds,
  setEmptySelectedConfigIds,
  projectId,
  showSaving,
  setShowSaving,
  isDrawerOpen = true,
  isSelectHidden = false,
  queueId,
  actionButtons,
  environment,
}: AnnotateDrawerContentProps<Target>) {
  const capture = usePostHogClientCapture();
  const router = useRouter();

  const form = useForm({
    resolver: zodResolver(AnnotateFormSchema),
    defaultValues: {
      scoreData: getDefaultAnnotationScoreData({
        scores,
        emptySelectedConfigIds,
        configs,
        scoreTarget,
      }),
    },
  });

  const { fields, remove, update, replace } = useFieldArray({
    control: form.control,
    name: "scoreData",
  });

  const prevEmptySelectedConfigIdsRef = useRef(emptySelectedConfigIds);

  const { optimisticScores, setOptimisticScore } = useScoreValues({
    getValues: form.getValues,
  });

  const { createMutation, updateMutation, deleteMutation } = useScoreMutations(
    scoreTarget,
    projectId,
    fields,
    update,
    remove,
    configs,
    isDrawerOpen,
    setShowSaving,
  );

  useEffect(() => {
    // Only reset the form if emptySelectedConfigIds has changed, compare by value not reference
    if (
      prevEmptySelectedConfigIdsRef.current.length !==
        emptySelectedConfigIds.length ||
      !prevEmptySelectedConfigIdsRef.current.every(
        (id, index) => id === emptySelectedConfigIds[index],
      )
    ) {
      form.reset({
        scoreData: getDefaultAnnotationScoreData({
          scores,
          emptySelectedConfigIds,
          configs,
          scoreTarget,
        }),
      });
    }

    prevEmptySelectedConfigIdsRef.current = emptySelectedConfigIds;
  }, [emptySelectedConfigIds, scores, configs, scoreTarget, form]);

  const pendingCreates = useRef(new Map<number, Promise<APIScoreV2>>());
  const pendingDeletes = useRef(new Set<string>());
  // Track when deletion was initiated for each score ID
  const deletionTimestamps = useRef(new Map<string, number>());
  const description = formatAnnotateDescription(scoreTarget);

  async function handleScoreChange(
    score: AnnotationScoreSchemaType,
    index: number,
    value: number,
    stringValue: string | null,
  ) {
    // Check if this score is currently being deleted
    if (score.scoreId && pendingDeletes.current.has(score.scoreId)) {
      // Skip updates for scores that are being deleted
      return;
    }

    // Check if there was a recent deletion request for this score
    if (score.scoreId && deletionTimestamps.current.has(score.scoreId)) {
      const deleteTime = deletionTimestamps.current.get(score.scoreId) || 0;
      const now = Date.now();
      // If deletion was requested in the last 5 seconds, ignore updates
      if (now - deleteTime < 5000) {
        return;
      }
      // Otherwise clear the old timestamp
      deletionTimestamps.current.delete(score.scoreId);
    }

    // Optimistically update the UI
    setOptimisticScore({
      index,
      value,
      stringValue,
    });

    try {
      // If we have an ID, straightforward update
      if (!!score.scoreId) {
        const validatedScore = UpdateAnnotationScoreData.parse({
          id: score.scoreId,
          projectId,
          scoreTarget,
          name: score.name,
          dataType: score.dataType,
          configId: score.configId,
          stringValue: stringValue ?? score.stringValue,
          comment: score.comment,
          value,
          queueId,
          environment,
        });

        await updateMutation.mutateAsync({
          ...validatedScore,
        });

        capture("score:update", {
          ...analyticsData,
          dataType: score.dataType,
        });
      } else {
        const pendingCreate = pendingCreates.current.get(index);

        if (pendingCreate) {
          // Wait for the pending create to complete to get the ID
          const createdScore = await pendingCreate;
          const validatedScore = UpdateAnnotationScoreData.parse({
            id: createdScore.id,
            projectId,
            scoreTarget,
            name: score.name,
            dataType: score.dataType,
            configId: score.configId,
            stringValue: stringValue ?? score.stringValue,
            comment: score.comment,
            value,
            queueId,
            environment,
          });

          await updateMutation.mutateAsync({
            ...validatedScore,
          });

          capture("score:update", {
            ...analyticsData,
            dataType: score.dataType,
          });
        } else {
          // If no pending create, straightforward create
          const validatedScore = CreateAnnotationScoreData.parse({
            projectId,
            scoreTarget,
            name: score.name,
            dataType: score.dataType,
            configId: score.configId,
            stringValue: stringValue ?? score.stringValue,
            comment: score.comment,
            value,
            queueId,
            environment,
          });

          const createPromise = createMutation.mutateAsync({
            ...validatedScore,
          });

          capture("score:create", {
            ...analyticsData,
            dataType: score.dataType,
          });

          pendingCreates.current.set(index, createPromise);

          // Wait for creation and cleanup
          const createdScore = await createPromise;
          pendingCreates.current.delete(index);

          // Update the form with the new ID
          update(index, {
            ...score,
            scoreId: createdScore.id,
            value: createdScore.value,
            stringValue: createdScore.stringValue ?? undefined,
          });
        }
      }
    } catch (error) {
      // Handle error and revert optimistic update
      console.error(error);
      setOptimisticScore({
        index,
        value: score.value ?? null,
        stringValue: score.stringValue ?? null,
      });
    }
  }

  function handleOnBlur({
    config,
    field,
    index,
    score,
  }: {
    config: ValidatedScoreConfig;
    field: ControllerRenderProps<
      AnnotateFormSchemaType,
      `scoreData.${number}.value`
    >;
    index: number;
    score: AnnotationScoreSchemaType;
  }): React.FocusEventHandler<HTMLInputElement> | undefined {
    return async () => {
      const { maxValue, minValue, dataType } = config;

      if (isNumericDataType(dataType)) {
        const formError = getFormError({
          value: field.value,
          maxValue,
          minValue,
        });
        if (!!formError) {
          form.setError(`scoreData.${index}.value`, formError);
          return;
        }
      }

      form.clearErrors(`scoreData.${index}.value`);

      if (isPresent(field.value)) {
        await handleScoreChange(score, index, Number(field.value), null);
      }
    };
  }

  useEffect(() => {
    if (
      updateMutation.isLoading ||
      createMutation.isLoading ||
      deleteMutation.isLoading
    ) {
      setShowSaving(true);
    } else {
      setShowSaving(false);
    }
  }, [
    updateMutation.isLoading,
    createMutation.isLoading,
    deleteMutation.isLoading,
    setShowSaving,
  ]);

  function handleOnCheckedChange(
    values: Record<string, string>[],
    changedValueId?: string,
  ) {
    if (values.length === 0) {
      const populatedScoreFields = fields.filter(({ scoreId }) => !!scoreId);
      replace(populatedScoreFields);
      setEmptySelectedConfigIds(
        populatedScoreFields
          .filter(({ configId }) => !!configId)
          .map(({ configId }) => configId as string),
      );
      return;
    }
    if (!changedValueId) return;

    const configToChange = configs.find(({ id }) => id === changedValueId);
    if (!configToChange) return;
    const { id, name, dataType } = configToChange;

    const index = fields.findIndex(({ configId }) => configId === id);

    if (index === -1) {
      setOptimisticScore({
        index: fields.length,
        value: null,
        stringValue: null,
        scoreId: null,
        name,
        dataType,
        configId: id,
      });
      replace([
        ...fields,
        {
          name,
          dataType,
          configId: id,
        },
      ]);
      setEmptySelectedConfigIds([...emptySelectedConfigIds, changedValueId]);
    } else {
      remove(index);
      setEmptySelectedConfigIds(
        emptySelectedConfigIds.filter((id) => id !== changedValueId),
      );
    }
  }

  function handleOnValueChange(
    score: AnnotationScoreSchemaType,
    index: number,
    configCategories: ConfigCategory[],
  ): ((value: string) => void) | undefined {
    return async (stringValue) => {
      const selectedCategory = configCategories.find(
        ({ label }) => label === stringValue,
      );
      if (selectedCategory) {
        const newValue = Number(selectedCategory.value);

        await handleScoreChange(score, index, newValue, stringValue);
        form.setValue(`scoreData.${index}.value`, newValue, {
          shouldValidate: true,
        });
      }
    };
  }

  function handleCommentUpdate({
    field,
    score,
    comment,
  }: {
    field: ControllerRenderProps<
      AnnotateFormSchemaType,
      `scoreData.${number}.comment`
    >;
    score: AnnotationScoreSchemaType;
    comment?: string | null;
  }): React.MouseEventHandler<HTMLButtonElement> | undefined {
    return async () => {
      const { value, scoreId } = score;
      if (!!field.value && !!scoreId && isPresent(value)) {
        const validatedScore = UpdateAnnotationScoreData.parse({
          id: scoreId,
          projectId,
          scoreTarget,
          name: score.name,
          dataType: score.dataType,
          configId: score.configId,
          stringValue: score.stringValue,
          value,
          comment,
          queueId,
          environment,
        });

        await updateMutation.mutateAsync({
          ...validatedScore,
        });

        capture(
          comment ? "score:update_comment" : "score:delete_comment",
          analyticsData,
        );
      }
    };
  }

  return (
    <div className="mx-auto w-full overflow-y-auto md:max-h-full">
      <DrawerHeader className="sticky top-0 z-10 rounded-sm bg-background">
        {isSelectHidden ? (
          <AnnotateHeader
            showSaving={showSaving}
            actionButtons={actionButtons}
            description={description}
          />
        ) : (
          <DrawerTitle>
            <AnnotateHeader
              showSaving={showSaving}
              actionButtons={actionButtons}
              description={description}
            />
          </DrawerTitle>
        )}

        {!isSelectHidden && (
          <div className="grid grid-flow-col items-center">
            <MultiSelectKeyValues
              placeholder="Value"
              align="end"
              items="empty scores"
              className="grid grid-cols-[auto,1fr,auto,auto] gap-2"
              onValueChange={handleOnCheckedChange}
              options={configs
                .filter(
                  (config) =>
                    !config.isArchived ||
                    fields.find((field) => field.configId === config.id),
                )
                .map((config) => ({
                  key: config.id,
                  value: `${getScoreDataTypeIcon(config.dataType)} ${config.name}`,
                  disabled:
                    fields.some(
                      (field) =>
                        !!field.scoreId && field.configId === config.id,
                    ) ||
                    optimisticScores.some(
                      (score) => score.configId === config.id && !!score.value,
                    ) ||
                    deleteMutation.isLoading,
                  isArchived: config.isArchived,
                }))}
              values={fields
                .filter((field) => !!field.configId)
                .map((field) => ({
                  value: `${getScoreDataTypeIcon(field.dataType)} ${field.name}`,
                  key: field.configId as string,
                }))}
              controlButtons={
                <DropdownMenuItem
                  onSelect={() => {
                    capture(
                      "score_configs:manage_configs_item_click",
                      analyticsData,
                    );
                    router.push(`/project/${projectId}/settings/scores`);
                  }}
                >
                  Manage score configs
                </DropdownMenuItem>
              }
            />
          </div>
        )}
      </DrawerHeader>
      <Form {...form}>
        <form className="flex flex-col gap-4">
          <div className="grid grid-flow-row gap-2 px-4">
            <FormField
              control={form.control}
              name="scoreData"
              render={() => (
                <>
                  {fields.map((score, index) => {
                    const config = configs.find(
                      (config) => config.id === score.configId,
                    );
                    if (!config) return null;
                    const categories =
                      (config.categories as ConfigCategory[]) ?? [];

                    return (
                      <div
                        key={score.id}
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
                                  isScoreUnsaved(score.scoreId) ||
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
                                render={({ field }) => (
                                  <FormItem className="space-y-4">
                                    <FormLabel className="text-sm">
                                      Comment (optional)
                                    </FormLabel>
                                    {!!field.value &&
                                      field.value !== score.comment && (
                                        <HoverCard>
                                          <HoverCardTrigger asChild>
                                            <span className="ml-2 mr-2 rounded-sm bg-input p-1 text-xs">
                                              Draft
                                            </span>
                                          </HoverCardTrigger>
                                          <HoverCardContent side="top">
                                            {!!score.comment && (
                                              <div className="mb-4 max-w-48 rounded border bg-background p-2 shadow-sm">
                                                <p className="text-xs">
                                                  Saved comment:{" "}
                                                  <span className="whitespace-pre-wrap">
                                                    {score.comment}
                                                  </span>
                                                </p>
                                              </div>
                                            )}
                                          </HoverCardContent>
                                        </HoverCard>
                                      )}
                                    <FormControl>
                                      <>
                                        <Textarea
                                          {...field}
                                          className="text-xs"
                                          value={field.value || ""}
                                        />
                                        {field.value !== score.comment && (
                                          <div className="grid w-full grid-cols-[1fr,1fr] gap-2">
                                            <PopoverClose asChild>
                                              <Button
                                                variant="secondary"
                                                type="button"
                                                size="sm"
                                                className="text-xs"
                                                disabled={!field.value}
                                                onClick={() => {
                                                  form.setValue(
                                                    `scoreData.${index}.comment`,
                                                    score.comment ?? "",
                                                  );
                                                }}
                                              >
                                                Discard
                                              </Button>
                                            </PopoverClose>
                                            <Button
                                              type="button"
                                              size="sm"
                                              className="text-xs"
                                              disabled={
                                                !field.value ||
                                                config.isArchived
                                              }
                                              loading={updateMutation.isLoading}
                                              onClick={handleCommentUpdate({
                                                field,
                                                score,
                                                comment: field.value,
                                              })}
                                            >
                                              Save
                                            </Button>
                                          </div>
                                        )}
                                        {field.value === score.comment && (
                                          <div className="flex justify-end">
                                            <Button
                                              variant="destructive"
                                              type="button"
                                              size="sm"
                                              className="text-xs"
                                              disabled={
                                                !field.value || !score.comment
                                              }
                                              loading={updateMutation.isLoading}
                                              onClick={handleCommentUpdate({
                                                field,
                                                score,
                                                comment: null,
                                              })}
                                            >
                                              Delete
                                            </Button>
                                          </div>
                                        )}
                                      </>
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                  </FormItem>
                                )}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="grid grid-cols-[11fr,1fr] items-center py-1">
                          <FormField
                            control={form.control}
                            name={`scoreData.${index}.value`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  {isNumericDataType(score.dataType) ? (
                                    <Input
                                      {...field}
                                      value={
                                        optimisticScores[index].value ?? ""
                                      }
                                      // manually manage controlled input state
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        const numValue =
                                          value === "" ? null : Number(value);
                                        setOptimisticScore({
                                          index,
                                          value: numValue,
                                          stringValue: null,
                                          scoreId: null,
                                        });
                                        field.onChange(numValue);
                                      }}
                                      type="number"
                                      className="text-xs"
                                      disabled={config.isArchived}
                                      onBlur={handleOnBlur({
                                        config,
                                        field,
                                        index,
                                        score,
                                      })}
                                      onKeyDown={handleOnKeyDown}
                                      onKeyUp={() => {
                                        const formError = getFormError({
                                          value: field.value,
                                          maxValue: config.maxValue,
                                          minValue: config.minValue,
                                        });
                                        if (!!formError) {
                                          form.setError(
                                            `scoreData.${index}.value`,
                                            formError,
                                          );
                                        } else {
                                          form.clearErrors(
                                            `scoreData.${index}.value`,
                                          );
                                        }
                                      }}
                                    />
                                  ) : config.categories &&
                                    renderSelect(categories) ? (
                                    <Select
                                      name={field.name}
                                      value={
                                        optimisticScores[index].stringValue ??
                                        ""
                                      }
                                      defaultValue={score.stringValue}
                                      disabled={config.isArchived}
                                      onValueChange={handleOnValueChange(
                                        score,
                                        index,
                                        categories,
                                      )}
                                    >
                                      <SelectTrigger>
                                        <div className="text-xs">
                                          <SelectValue placeholder="Select category" />
                                        </div>
                                      </SelectTrigger>
                                      <SelectContent>
                                        {categories.map(
                                          (category: ConfigCategory) => (
                                            <SelectItem
                                              key={category.value}
                                              value={category.label}
                                              className="text-xs"
                                            >
                                              {category.label}
                                            </SelectItem>
                                          ),
                                        )}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <ToggleGroup
                                      type="single"
                                      value={
                                        optimisticScores[index].stringValue ??
                                        ""
                                      }
                                      defaultValue={score.stringValue}
                                      disabled={config.isArchived}
                                      className={`grid grid-cols-${categories.length}`}
                                      onValueChange={handleOnValueChange(
                                        score,
                                        index,
                                        categories,
                                      )}
                                    >
                                      {categories.map(
                                        (category: ConfigCategory) => (
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
                                            <span>{`(${category.value})`}</span>
                                          </ToggleGroupItem>
                                        ),
                                      )}
                                    </ToggleGroup>
                                  )}
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />
                          {config.isArchived ? (
                            <Popover key={score.id}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="link"
                                  type="button"
                                  className="px-0 pl-1"
                                  title="Delete archived score"
                                  disabled={isScoreUnsaved(score.scoreId)}
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
                                    loading={deleteMutation.isLoading}
                                    onClick={async () => {
                                      if (score.scoreId) {
                                        // Record deletion timestamp
                                        deletionTimestamps.current.set(
                                          score.scoreId,
                                          Date.now(),
                                        );

                                        setOptimisticScore({
                                          index,
                                          value: null,
                                          stringValue: null,
                                          scoreId: null,
                                        });

                                        // Track pending delete
                                        pendingDeletes.current.add(
                                          score.scoreId,
                                        );

                                        try {
                                          await deleteMutation.mutateAsync({
                                            id: score.scoreId,
                                            projectId,
                                          });
                                          capture(
                                            "score:delete",
                                            analyticsData,
                                          );
                                          form.clearErrors(
                                            `scoreData.${index}.value`,
                                          );

                                          // Update the form with the new ID
                                          update(index, {
                                            ...score,
                                            scoreId: undefined,
                                            value: null,
                                            stringValue: undefined,
                                          });
                                        } finally {
                                          // Clean up pending delete tracking
                                          pendingDeletes.current.delete(
                                            score.scoreId,
                                          );
                                        }
                                      }
                                    }}
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
                                isScoreUnsaved(score.scoreId) ||
                                updateMutation.isLoading
                              }
                              loading={
                                deleteMutation.isLoading &&
                                !optimisticScores.some(
                                  (s) => s.scoreId === score.scoreId,
                                ) &&
                                !isScoreUnsaved(score.scoreId)
                              }
                              onClick={async () => {
                                if (score.scoreId) {
                                  // Record deletion timestamp
                                  deletionTimestamps.current.set(
                                    score.scoreId,
                                    Date.now(),
                                  );

                                  setOptimisticScore({
                                    index,
                                    value: null,
                                    stringValue: null,
                                    scoreId: null,
                                  });

                                  // Track pending delete
                                  pendingDeletes.current.add(score.scoreId);

                                  try {
                                    await deleteMutation.mutateAsync({
                                      id: score.scoreId,
                                      projectId,
                                    });
                                    capture("score:delete", analyticsData);
                                    form.clearErrors(
                                      `scoreData.${index}.value`,
                                    );

                                    // Update the form with the new ID
                                    update(index, {
                                      ...score,
                                      scoreId: undefined,
                                      value: null,
                                      stringValue: undefined,
                                    });
                                  } finally {
                                    // Clean up pending delete tracking
                                    pendingDeletes.current.delete(
                                      score.scoreId,
                                    );
                                  }
                                }
                              }}
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
