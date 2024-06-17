import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import React from "react";
import { Button } from "@/src/components/ui/button";
import {
  LockIcon,
  MessageCircleMore,
  MessageCircle,
  X,
  SquarePen,
  Archive,
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
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTrigger,
} from "@/src/components/ui/drawer";
import {
  type ConfigCategory,
  ScoreDataType,
  type Score,
  type ScoreConfig,
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
import { ScoreConfigDetails } from "@/src/features/manual-scoring/components/ScoreConfigDetails";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import {
  isNumericDataType,
  isPresent,
  isScoreUnsaved,
} from "@/src/features/manual-scoring/lib/helpers";
import { getDefaultScoreData } from "@/src/features/manual-scoring/lib/getDefaultScoreData";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import Header from "@/src/components/layouts/header";
import { MultiSelectKeyValues } from "@/src/features/manual-scoring/components/multi-select-key-values";
import { CommandItem } from "@/src/components/ui/command";
import { useRouter } from "next/router";
import useLocalStorage from "@/src/components/useLocalStorage";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";

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

export function AnnotateDrawer({
  traceId,
  scores,
  observationId,
  projectId,
  variant = "button",
  type = "trace",
  source = "TraceDetail",
}: {
  traceId: string;
  scores: Score[];
  observationId?: string;
  projectId: string;
  variant?: "button" | "badge";
  type?: "trace" | "observation" | "session";
  source?: "TraceDetail" | "SessionDetail";
}) {
  const capture = usePostHogClientCapture();
  const hasAccess = useHasAccess({
    projectId,
    scope: "scores:CUD",
  });

  const configsData = api.scoreConfigs.all.useQuery({
    projectId,
  });

  const configs = configsData.data?.configs ?? [];

  const [emptySelectedConfigIds, setEmptySelectedConfigIds] = useLocalStorage<
    string[]
  >("emptySelectedConfigIds", []);

  const form = useForm<AnnotateFormSchemaType>({
    resolver: zodResolver(AnnotateFormSchema),
    defaultValues: {
      scoreData: getDefaultScoreData({
        scores,
        traceId,
        observationId,
        emptySelectedConfigIds,
        configs,
      }),
    },
  });

  const router = useRouter();

  const { fields, remove, update, replace } = useFieldArray({
    control: form.control,
    name: "scoreData",
  });

  const mutDeleteScore = api.scores.deleteAnnotationScore.useMutation({
    onError: (error) => {
      trpcErrorToast(error);
    },
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
    },
  });

  const utils = api.useUtils();

  const onSettledUpsert = async (data?: Score, error?: unknown) => {
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
  };

  const mutCreateScores = api.scores.createAnnotationScore.useMutation({
    onError: (error) => {
      trpcErrorToast(error);
    },
    onSettled: onSettledUpsert,
  });

  const mutUpdateScores = api.scores.updateAnnotationScore.useMutation({
    onError: (error) => {
      trpcErrorToast(error);
    },
    onSettled: onSettledUpsert,
  });

  if (!hasAccess && variant === "badge") return null;

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

        update(index, {
          ...score,
          value: newValue,
        });

        if (!!stringValue) {
          if (!!score.scoreId) {
            await mutUpdateScores.mutateAsync({
              projectId,
              ...score,
              id: score.scoreId,
              value: newValue,
              stringValue,
            });
            capture("score:update", {
              type: type,
              source: source,
              dataType: score.dataType,
            });
          } else {
            await mutCreateScores.mutateAsync({
              projectId,
              traceId,
              ...score,
              observationId,
              value: newValue,
              stringValue,
            });
            capture("score:create", {
              type: type,
              source: source,
              dataType: score.dataType,
            });
          }
        }
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
        await mutUpdateScores.mutateAsync({
          projectId,
          ...score,
          value,
          id: scoreId,
          comment,
        });
        capture(comment ? "score:update_comment" : "score:delete_comment", {
          type: type,
          source: source,
        });
      }
    };
  }

  function handleOnBlur({
    config,
    field,
    index,
    score,
  }: {
    config: ScoreConfig;
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
        if (!!score.scoreId) {
          await mutUpdateScores.mutateAsync({
            projectId,
            ...score,
            value: Number(field.value),
            id: score.scoreId,
          });
          capture("score:update", {
            type: type,
            source: source,
            dataType: score.dataType,
          });
        } else {
          await mutCreateScores.mutateAsync({
            projectId,
            traceId,
            ...score,
            observationId,
            value: Number(field.value),
          });
          capture("score:create", {
            type: type,
            source: source,
            dataType: score.dataType,
          });
        }
      }
    };
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>
        {variant === "button" ? (
          <Button
            variant="secondary"
            disabled={!hasAccess}
            onClick={() =>
              capture(
                Boolean(scores.length)
                  ? "score:update_form_open"
                  : "score:create_form_open",
                {
                  type: type,
                  source: source,
                },
              )
            }
          >
            {!hasAccess ? (
              <LockIcon className="mr-2 h-3 w-3" />
            ) : (
              <SquarePen className="mr-2 h-5 w-5" />
            )}
            <span>Annotate</span>
          </Button>
        ) : (
          <Button
            className="h-6 rounded-full px-3 text-xs"
            onClick={() =>
              capture(
                Boolean(scores.length)
                  ? "score:update_form_open"
                  : "score:create_form_open",
                {
                  type: type,
                  source: source,
                },
              )
            }
          >
            Annotate
          </Button>
        )}
      </DrawerTrigger>
      <DrawerContent className="h-1/3">
        <div className="mx-auto w-full overflow-y-auto md:max-h-full">
          <DrawerHeader className="sticky top-0 z-10 rounded-sm bg-background">
            <Header
              title="Annotate"
              level="h3"
              help={{
                description: `Annotate ${observationId ? "observation" : "trace"} with scores to capture human evaluation across different dimensions.`,
                href: "https://langfuse.com/docs/scores/manually",
              }}
            ></Header>
            <div className="grid grid-flow-col items-center">
              <MultiSelectKeyValues
                title="Value"
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
                    value: config.name,
                    disabled: fields.some(
                      (field) =>
                        !!field.scoreId && field.configId === config.id,
                    ),
                    isArchived: config.isArchived,
                  }))}
                values={fields
                  .filter((field) => !!field.configId)
                  .map((field) => ({
                    value: field.name,
                    key: field.configId as string,
                  }))}
                controlButtons={
                  <CommandItem
                    onSelect={() => {
                      capture("score_configs:manage_configs_item_click", {
                        type: type,
                        source: source,
                      });
                      router.push(
                        `/project/${projectId}/settings#score-configs`,
                      );
                    }}
                  >
                    Manage score configs
                  </CommandItem>
                }
              />
            </div>
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
                                    config.isArchived
                                      ? "text-foreground/40"
                                      : "",
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
                                                      {score.comment}
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
                                                <Button
                                                  variant="secondary"
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
                                                <PopoverClose asChild>
                                                  <Button
                                                    variant="destructive"
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
                                                    !field.value ||
                                                    !score.comment
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
                                          value={field.value ?? undefined}
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
                                  disabled={isScoreUnsaved(score.scoreId)}
                                  loading={mutDeleteScore.isLoading}
                                  onClick={async () => {
                                    if (score.scoreId) {
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
      </DrawerContent>
    </Drawer>
  );
}

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
