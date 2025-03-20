import React, { useCallback, useEffect, useRef, useState } from "react";
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
  type APIScore,
  isPresent,
  ScoreDataType,
  CreateAnnotationScoreData,
  UpdateAnnotationScoreData,
  type ValidatedScoreConfig,
  type ConfigCategory,
} from "@langfuse/shared";
import { z } from "zod";
import { Input } from "@/src/components/ui/input";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { api } from "@/src/utils/api";
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
  isNumericDataType,
  isScoreUnsaved,
} from "@/src/features/scores/lib/helpers";
import { getDefaultScoreData } from "@/src/features/scores/lib/getDefaultScoreData";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import Header from "@/src/components/layouts/header";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { useRouter } from "next/router";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";
import { getScoreDataTypeIcon } from "@/src/features/scores/components/ScoreDetailColumnHelpers";
import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";

const AnnotationScoreDataSchema = z.object({
  name: z.string(),
  scoreId: z.string().optional(),
  value: z.number().nullable().optional(),
  stringValue: z.string().optional(),
  dataType: z.nativeEnum(ScoreDataType),
  configId: z.string().optional(),
  comment: z.string().optional(),
});

const AnnotateFormSchema = z.object({
  scoreData: z.array(AnnotationScoreDataSchema),
});

type AnnotateFormSchemaType = z.infer<typeof AnnotateFormSchema>;
type AnnotationScoreSchemaType = z.infer<typeof AnnotationScoreDataSchema>;

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
  observationId,
}: {
  showSaving: boolean;
  actionButtons: React.ReactNode;
  observationId?: string;
}) {
  return (
    <Header
      title="Annotate"
      help={{
        description: `Annotate ${observationId ? "observation" : "trace"} with scores to capture human evaluation across different dimensions.`,
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

function useCustomOptimistic<State, Action>(
  initialState: State,
  reducer: (state: State, action: Action) => State,
): [State, (action: Action) => void] {
  const [state, setState] = useState<State>(initialState);

  const dispatch = useCallback(
    (action: Action) => {
      setState((currentState) => reducer(currentState, action));
    },
    [reducer],
  );

  return [state, dispatch];
}

export function AnnotateDrawerContent({
  traceId,
  scores,
  configs,
  emptySelectedConfigIds,
  setEmptySelectedConfigIds,
  observationId,
  projectId,
  showSaving,
  setShowSaving,
  isDrawerOpen = true,
  type = "trace",
  source = "TraceDetail",
  isSelectHidden = false,
  queueId,
  actionButtons,
}: {
  traceId: string;
  scores: APIScore[];
  configs: ValidatedScoreConfig[];
  emptySelectedConfigIds: string[];
  setEmptySelectedConfigIds: (ids: string[]) => void;
  observationId?: string;
  projectId: string;
  showSaving: boolean;
  setShowSaving: (showSaving: boolean) => void;
  isDrawerOpen?: boolean;
  type?: "trace" | "observation" | "session";
  source?: "TraceDetail" | "SessionDetail";
  isSelectHidden?: boolean;
  queueId?: string;
  actionButtons?: React.ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const router = useRouter();

  const form = useForm<AnnotateFormSchemaType>({
    resolver: zodResolver(AnnotateFormSchema),
    defaultValues: {
      scoreData: getDefaultScoreData({
        scores,
        emptySelectedConfigIds,
        configs,
        traceId,
        observationId,
      }),
    },
  });

  const [optimisticScores, setOptimisticScore] = useCustomOptimistic<
    AnnotateFormSchemaType["scoreData"],
    {
      index: number;
      value: number | null;
      stringValue: string | null;
      name?: string | null;
      dataType?: ScoreDataType | null;
      configId?: string | null;
    }
  >(form.getValues().scoreData, (state, updatedScore) => {
    const stateCopy = state.map((score, idx) =>
      idx === updatedScore.index
        ? {
            ...score,
            value: updatedScore.value,
            stringValue: updatedScore.stringValue ?? undefined,
          }
        : score,
    );

    if (updatedScore.index === stateCopy.length) {
      const newScore = {
        name: updatedScore.name ?? "",
        dataType: updatedScore.dataType ?? ScoreDataType.NUMERIC,
        configId: updatedScore.configId ?? undefined,
        value: updatedScore.value,
        stringValue: updatedScore.stringValue ?? undefined,
      };
      return [...stateCopy, newScore];
    }
    return stateCopy;
  });

  const { fields, remove, update, replace } = useFieldArray({
    control: form.control,
    name: "scoreData",
  });

  const prevEmptySelectedConfigIdsRef = useRef(emptySelectedConfigIds);

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
        scoreData: getDefaultScoreData({
          scores,
          emptySelectedConfigIds,
          configs,
          traceId,
          observationId,
        }),
      });
    }

    prevEmptySelectedConfigIdsRef.current = emptySelectedConfigIds;
  }, [emptySelectedConfigIds, scores, configs, traceId, observationId, form]);

  const mutDeleteScore = api.scores.deleteAnnotationScore.useMutation({
    onSettled: async (data, error) => {
      if (!data || error) return;

      const { id, name, dataType, configId } = data;
      const updatedScoreIndex = fields.findIndex(
        (field) => field.scoreId === id,
      );

      const config = configs.find((config) => config.id === configId);
      if (config && config.isArchived) {
        remove(updatedScoreIndex);
      } else {
        update(updatedScoreIndex, {
          name,
          dataType,
          configId: configId ?? undefined,
          value: null,
          scoreId: undefined,
          stringValue: undefined,
          comment: undefined,
        });
      }

      await Promise.all([
        utils.scores.invalidate(),
        utils.traces.invalidate(),
        utils.sessions.invalidate(),
      ]);

      if (!isDrawerOpen) setShowSaving(false);
    },
  });

  const utils = api.useUtils();

  const onSettledUpsert = async (data?: APIScore, error?: unknown) => {
    if (!data || error) return;

    const { id, value, stringValue, name, dataType, configId, comment } = data;
    const updatedScoreIndex = fields.findIndex(
      (field) => field.configId === configId,
    );

    update(updatedScoreIndex, {
      value,
      name,
      dataType,
      scoreId: id,
      stringValue: stringValue ?? undefined,
      configId: configId ?? undefined,
      comment: comment ?? undefined,
    });

    await Promise.all([
      utils.scores.invalidate(),
      utils.traces.invalidate(),
      utils.sessions.invalidate(),
    ]);

    if (!isDrawerOpen) setShowSaving(false);
  };

  const mutCreateScores = api.scores.createAnnotationScore.useMutation({
    onSettled: onSettledUpsert,
  });

  const mutUpdateScores = api.scores.updateAnnotationScore.useMutation({
    onSettled: onSettledUpsert,
  });

  const pendingCreates = useRef(new Map<number, Promise<APIScore>>());

  async function handleScoreChange(
    score: AnnotationScoreSchemaType,
    index: number,
    value: number,
    stringValue: string | null,
  ) {
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
          traceId,
          name: score.name,
          dataType: score.dataType,
          configId: score.configId,
          stringValue: stringValue ?? score.stringValue,
          comment: score.comment,
          observationId,
          value,
          queueId,
        });

        await mutUpdateScores.mutateAsync({
          ...validatedScore,
        });

        capture("score:update", {
          type: type,
          source: source,
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
            traceId,
            name: score.name,
            dataType: score.dataType,
            configId: score.configId,
            stringValue: stringValue ?? score.stringValue,
            comment: score.comment,
            observationId,
            value,
            queueId,
          });

          await mutUpdateScores.mutateAsync({
            ...validatedScore,
          });

          capture("score:update", {
            type: type,
            source: source,
            dataType: score.dataType,
          });
        } else {
          // If no pending create, straightforward create
          const validatedScore = CreateAnnotationScoreData.parse({
            projectId,
            traceId,
            name: score.name,
            dataType: score.dataType,
            configId: score.configId,
            stringValue: stringValue ?? score.stringValue,
            comment: score.comment,
            observationId,
            value,
            queueId,
          });

          const createPromise = mutCreateScores.mutateAsync({
            ...validatedScore,
          });

          capture("score:create", {
            type: type,
            source: source,
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
      mutUpdateScores.isLoading ||
      mutCreateScores.isLoading ||
      mutDeleteScore.isLoading
    ) {
      setShowSaving(true);
    } else {
      setShowSaving(false);
    }
  }, [
    mutUpdateScores.isLoading,
    mutCreateScores.isLoading,
    mutDeleteScore.isLoading,
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
          traceId,
          name: score.name,
          dataType: score.dataType,
          configId: score.configId,
          stringValue: score.stringValue,
          observationId,
          value,
          comment,
          queueId,
        });

        await mutUpdateScores.mutateAsync({
          ...validatedScore,
        });

        capture(comment ? "score:update_comment" : "score:delete_comment", {
          type: type,
          source: source,
        });
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
            observationId={observationId}
          />
        ) : (
          <DrawerTitle>
            <AnnotateHeader
              showSaving={showSaving}
              actionButtons={actionButtons}
              observationId={observationId}
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
                    mutDeleteScore.isLoading,
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
                    capture("score_configs:manage_configs_item_click", {
                      type: type,
                      source: source,
                    });
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
                                                  Saved comment: {score.comment}
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
                                              loading={
                                                mutUpdateScores.isLoading
                                              }
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
                                              loading={
                                                mutUpdateScores.isLoading
                                              }
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
                                            <span className="text-primary/60">{`(${category.value})`}</span>
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
                                    loading={mutDeleteScore.isLoading}
                                    onClick={async () => {
                                      if (score.scoreId) {
                                        setOptimisticScore({
                                          index,
                                          value: null,
                                          stringValue: null,
                                        });
                                        await mutDeleteScore.mutateAsync({
                                          id: score.scoreId,
                                          projectId,
                                        });
                                        capture("score:delete", {
                                          type: type,
                                          source: source,
                                        });
                                        form.clearErrors(
                                          `scoreData.${index}.value`,
                                        );
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
                                mutUpdateScores.isLoading
                              }
                              loading={
                                mutDeleteScore.isLoading &&
                                !optimisticScores.some(
                                  (s) => s.scoreId === score.scoreId,
                                ) &&
                                !isScoreUnsaved(score.scoreId)
                              }
                              onClick={async () => {
                                if (score.scoreId) {
                                  setOptimisticScore({
                                    index,
                                    value: null,
                                    stringValue: null,
                                  });
                                  await mutDeleteScore.mutateAsync({
                                    id: score.scoreId,
                                    projectId,
                                  });
                                  capture("score:delete", {
                                    type: type,
                                    source: source,
                                  });
                                  form.clearErrors(`scoreData.${index}.value`);
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
