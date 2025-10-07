import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import {
  MessageCircleMore,
  MessageCircle,
  X,
  Archive,
  Loader2,
  Check,
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
import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";
import {
  type ScoreTarget,
  type AnnotateDrawerProps,
  type OnMutateCallbacks,
} from "@/src/features/scores/types";
import { useScoreValues } from "@/src/features/scores/hooks/useScoreValues";
import { AnnotateFormSchema } from "@/src/features/scores/schema";
import { ScoreConfigDetails } from "@/src/features/score-configs/components/ScoreConfigDetails";
import {
  enrichCategories,
  getAnnotationFormError,
  resolveConfigValue,
} from "@/src/features/scores/lib/annotationFormHelpers";
import { useAnnotationFormHandlers } from "@/src/features/scores/hooks/useAnnotationFormHandlers";
import { useConfigSelection } from "@/src/features/scores/hooks/useConfigSelection";

const CHAR_CUTOFF = 6;

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

type AnnotateDrawerContentProps<Target extends ScoreTarget> =
  AnnotateDrawerProps<Target> & {
    configs: ScoreConfigDomain[];
    isSelectHidden?: boolean;
    queueId?: string;
    actionButtons?: React.ReactNode;
    onMutateCallbacks?: OnMutateCallbacks;
  };

export function AnnotateDrawerContent<Target extends ScoreTarget>({
  scoreTarget,
  scores,
  configs,
  analyticsData,
  emptySelectedConfigIds,
  setEmptySelectedConfigIds,
  projectId,
  isSelectHidden = false,
  queueId,
  actionButtons,
  environment,
  onMutateCallbacks,
}: AnnotateDrawerContentProps<Target>) {
  const capture = usePostHogClientCapture();
  const router = useRouter();

  const [showSaving, setShowSaving] = useState(false);

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
  const description = formatAnnotateDescription(scoreTarget);

  const { optimisticScores, setOptimisticScore } = useScoreValues({
    getValues: form.getValues,
  });

  const {
    isScoreWritePending,
    isScoreDeletePending,
    isScoreUpdatePending,
    handleCommentUpdate,
    handleOnBlur,
    handleOnValueChange,
    handleDeleteScore,
  } = useAnnotationFormHandlers({
    // Core
    form,
    fields,
    update,
    remove,
    // Configs
    configs,
    // Optimistic scores
    setOptimisticScore,
    // Callbacks
    onMutateCallbacks,
    // Score data
    scoreTarget,
    scoreMetadata: {
      projectId,
      queueId,
      environment,
    },
    // Analytics
    analyticsData,
  });

  const isConfigDisabled = (config: ScoreConfigDomain) => {
    return (
      fields.some((field) => !!field.scoreId && field.configId === config.id) ||
      optimisticScores.some(
        (score) => score.configId === config.id && !!score.value,
      ) ||
      isScoreDeletePending
    );
  };

  const { selectionOptions, handleConfigSelectionChange } = useConfigSelection({
    fields,
    remove,
    replace,
    configs,
    emptySelectedConfigIds,
    setEmptySelectedConfigIds,
    setOptimisticScore,
    isConfigDisabled,
  });

  useEffect(() => {
    if (isScoreWritePending) {
      setShowSaving(true);
    } else {
      setShowSaving(false);
    }
  }, [isScoreWritePending, setShowSaving]);

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

  return (
    <div className="mx-auto w-full space-y-2 overflow-y-auto md:max-h-full">
      <div className="sticky top-0 z-10 rounded-sm bg-background">
        {isSelectHidden ? (
          <AnnotateHeader
            showSaving={showSaving}
            actionButtons={actionButtons}
            description={description}
          />
        ) : (
          <div>
            <AnnotateHeader
              showSaving={showSaving}
              actionButtons={actionButtons}
              description={description}
            />
          </div>
        )}

        {!isSelectHidden && (
          <div className="grid grid-flow-col items-center">
            <MultiSelectKeyValues
              placeholder="Value"
              align="end"
              items="empty scores"
              className="grid grid-cols-[auto,1fr,auto,auto] gap-2"
              onValueChange={handleConfigSelectionChange}
              options={selectionOptions}
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
                    router.push(`/project/${projectId}/settings/scores`);
                  }}
                >
                  Manage score configs
                </DropdownMenuItem>
              }
            />
          </div>
        )}
      </div>
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
                    const categories = enrichCategories(
                      config.categories ?? [],
                      score.stringValue,
                    );

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
                                              loading={isScoreUpdatePending}
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
                                              loading={isScoreUpdatePending}
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
                                        const formError =
                                          getAnnotationFormError({
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
                                        {categories.map((category) =>
                                          category.isOutdated ? (
                                            <SelectItem
                                              key={category.value}
                                              value={category.label}
                                              disabled
                                              className="text-muted-foreground line-through"
                                            >
                                              {category.label}
                                            </SelectItem>
                                          ) : (
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
                                    loading={isScoreDeletePending}
                                    onClick={() =>
                                      handleDeleteScore(score, index)
                                    }
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
                                isScoreUpdatePending
                              }
                              loading={
                                isScoreDeletePending &&
                                !optimisticScores.some(
                                  (s) => s.scoreId === score.scoreId,
                                ) &&
                                !isScoreUnsaved(score.scoreId)
                              }
                              onClick={() => handleDeleteScore(score, index)}
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
