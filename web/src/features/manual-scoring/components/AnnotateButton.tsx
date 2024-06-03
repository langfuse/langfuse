import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import React, { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { LockIcon, MessageCircle, MessageCircleMore, X } from "lucide-react";
import {
  type ControllerRenderProps,
  useFieldArray,
  useForm,
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
import Link from "next/link";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTrigger,
} from "@/src/components/ui/drawer";
import { ScoreDataType, type Score, type ScoreConfig } from "@langfuse/shared";
import { z } from "zod";
import { Input } from "@/src/components/ui/input";
import { Checkbox } from "@/src/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { api } from "@/src/utils/api";
import { type CheckedState } from "@radix-ui/react-checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { HoverCardContent } from "@radix-ui/react-hover-card";
import { HoverCard, HoverCardTrigger } from "@/src/components/ui/hover-card";
import { ScoreConfigDetails } from "@/src/features/manual-scoring/components/ScoreConfigDetails";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import {
  isCategorical,
  isNumeric,
  isPresent,
  isScoreUnsaved,
} from "@/src/features/manual-scoring/lib/helpers";
import { getDefaultScoreData } from "@/src/features/manual-scoring/lib/getDefaultScoreData";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import Header from "@/src/components/layouts/header";
import { cn } from "@/src/utils/tailwind";

const AnnotationScoreDataSchema = z.object({
  name: z.string(),
  scoreId: z.string().optional(),
  value: z.number().optional(),
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
type ConfigCategory = {
  label: string;
  value: string;
};

export function AnnotateButton({
  traceId,
  scores,
  configs,
  observationId,
  projectId,
  variant = "button",
}: {
  traceId: string;
  scores: Score[];
  configs: ScoreConfig[];
  observationId?: string;
  projectId: string;
  variant?: "button" | "badge";
}) {
  const [isConfigPopoverOpen, setIsConfigPopoverOpen] = useState(false);

  const hasAccess = useHasAccess({
    projectId,
    scope: "scores:CUD",
  });

  const form = useForm<z.infer<typeof AnnotateFormSchema>>({
    resolver: zodResolver(AnnotateFormSchema),
    defaultValues: {
      scoreData: getDefaultScoreData({
        scores,
        traceId,
        observationId,
      }),
    },
  });

  const { fields, append, remove, update } = useFieldArray({
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
      update(updatedScoreIndex, {
        name,
        dataType,
        configId: configId ?? undefined,
        value: undefined,
        scoreId: undefined,
        stringValue: undefined,
        comment: undefined,
      });

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

  function handleOnCheckedChange(config: ScoreConfig, value: CheckedState) {
    const index = fields.findIndex((field) => field.configId === config.id);

    value
      ? append({
          name: config.name,
          dataType: config.dataType,
          configId: config.id,
        })
      : remove(index);
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
          if (!!score.scoreId)
            await mutUpdateScores.mutateAsync({
              projectId,
              ...score,
              id: score.scoreId,
              value: newValue,
              stringValue,
            });
          else
            await mutCreateScores.mutateAsync({
              projectId,
              traceId,
              ...score,
              observationId,
              value: newValue,
              stringValue,
            });
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
      if (!!field.value && !!scoreId && isPresent(value))
        await mutUpdateScores.mutateAsync({
          projectId,
          ...score,
          value,
          id: scoreId,
          comment,
        });
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

      if (isNumeric(dataType)) {
        if (
          (!!maxValue && Number(field.value) > maxValue) ||
          (!!minValue && Number(field.value) < minValue)
        ) {
          form.setError(`scoreData.${index}.value`, {
            type: "custom",
            message: `Not in range: [${minValue ?? "-∞"},${maxValue ?? "∞"}]`,
          });
          return;
        }
      }

      form.clearErrors(`scoreData.${index}.value`);

      if (!!field.value) {
        if (!!score.scoreId)
          await mutUpdateScores.mutateAsync({
            projectId,
            ...score,
            value: Number(field.value),
            id: score.scoreId,
          });
        else
          await mutCreateScores.mutateAsync({
            projectId,
            traceId,
            ...score,
            observationId,
            value: Number(field.value),
          });
      }
    };
  }

  return (
    <Drawer onClose={() => setIsConfigPopoverOpen(false)}>
      <DrawerTrigger asChild>
        {variant === "button" ? (
          <Button variant="secondary" disabled={!hasAccess}>
            <span>Annotate</span>
            {!hasAccess ? <LockIcon className="ml-2 h-3 w-3" /> : null}
          </Button>
        ) : (
          <Button className="h-6 rounded-full px-3 text-xs">Annotate</Button>
        )}
      </DrawerTrigger>
      <DrawerContent className="h-1/3">
        <div className="mx-auto w-full overflow-y-auto md:max-h-full">
          <DrawerHeader className="sticky top-0 z-10 bg-background">
            <Header
              title="Annotate"
              level="h3"
              help={{
                description: `Annotate ${observationId ? "observation" : "trace"} with scores to capture human evaluation across different dimensions.`,
                href: "https://langfuse.com/docs/scores/manually",
              }}
            ></Header>
            <div className="grid grid-flow-col items-center">
              <Popover open={isConfigPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="secondary"
                    disabled={!hasAccess}
                    onClick={() => setIsConfigPopoverOpen(true)}
                    className="ml-2"
                  >
                    Score selection
                  </Button>
                </PopoverTrigger>
                <PopoverContent>
                  <ScrollArea>
                    <div className="flex max-h-64 flex-col space-y-4">
                      <div className="flex items-center justify-between">
                        <>
                          <Link
                            className="inline-block
       rounded bg-primary-accent/10 px-2 py-1 text-sm font-semibold text-accent-dark-blue shadow-sm hover:bg-accent-light-blue/45"
                            href={`/project/${projectId}/settings`}
                          >
                            Add new config in settings
                          </Link>
                          <Button
                            onClick={() => setIsConfigPopoverOpen(false)}
                            variant="ghost"
                            size="icon"
                            className="mr-2 flex w-fit"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      </div>
                      <div className="flex border" />
                      {configs.map((config) => (
                        <div
                          className="grid grid-cols-[auto,1fr] items-center gap-2 text-left text-sm"
                          key={config.id}
                        >
                          <Checkbox
                            checked={fields.some(
                              ({ configId }) => configId === config.id,
                            )}
                            disabled={fields.some(
                              ({ value, configId }) =>
                                isPresent(value) && configId === config.id,
                            )}
                            onCheckedChange={(value) =>
                              handleOnCheckedChange(config, value)
                            }
                          />
                          <span>{config.name}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
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

                        return (
                          <div
                            key={score.id}
                            className="grid w-full grid-cols-[1fr,2fr] items-center gap-8 text-left"
                          >
                            <div className="grid h-full grid-cols-[1fr,auto] items-center gap-1">
                              {config.description ? (
                                <HoverCard>
                                  <HoverCardTrigger asChild>
                                    <span className="text-wrap break-words text-xs font-medium underline decoration-muted-gray decoration-dashed underline-offset-4">
                                      {score.name}
                                    </span>
                                  </HoverCardTrigger>
                                  <HoverCardContent>
                                    <ScoreConfigDetails config={config} />
                                  </HoverCardContent>
                                </HoverCard>
                              ) : (
                                <span className="text-wrap break-words text-xs font-medium">
                                  {score.name}
                                </span>
                              )}
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    type="button"
                                    size="xs"
                                    className="mb-4 px-0"
                                    disabled={isScoreUnsaved(score.scoreId)}
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
                                      <FormItem>
                                        <FormLabel>
                                          Comment (optional)
                                        </FormLabel>
                                        {field.value !== score.comment && (
                                          <HoverCard>
                                            <HoverCardTrigger asChild>
                                              <span className="ml-1 mr-2 rounded-sm bg-input p-1 text-xs">
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
                                              value={field.value || ""}
                                            />
                                            <div className="mt-2 flex justify-end">
                                              {field.value !==
                                                score.comment && (
                                                <div className="grid w-full grid-cols-[1fr,1fr] gap-2">
                                                  <Button
                                                    variant="secondary"
                                                    type="button"
                                                    disabled={!field.value}
                                                    loading={
                                                      mutUpdateScores.isLoading
                                                    }
                                                    onClick={handleCommentUpdate(
                                                      {
                                                        field,
                                                        score,
                                                        comment: field.value,
                                                      },
                                                    )}
                                                  >
                                                    Save
                                                  </Button>
                                                  <Button
                                                    variant="secondary"
                                                    type="button"
                                                    disabled={!field.value}
                                                    loading={
                                                      mutUpdateScores.isLoading
                                                    }
                                                    onClick={() =>
                                                      form.setValue(
                                                        `scoreData.${index}.comment`,
                                                        score.comment ?? "",
                                                      )
                                                    }
                                                  >
                                                    Discard
                                                  </Button>
                                                </div>
                                              )}
                                              {field.value ===
                                                score.comment && (
                                                <Button
                                                  variant="destructive"
                                                  type="button"
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
                                              )}
                                            </div>
                                          </>
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>
                            <div className="grid grid-cols-[1fr,min-content] gap-2">
                              <FormField
                                control={form.control}
                                name={`scoreData.${index}.value`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      {isNumeric(score.dataType) ? (
                                        <Input
                                          {...field}
                                          type="number"
                                          className="text-xs"
                                          onBlur={handleOnBlur({
                                            config,
                                            field,
                                            index,
                                            score,
                                          })}
                                        />
                                      ) : config.categories &&
                                        (
                                          (config.categories as ConfigCategory[]) ??
                                          []
                                        ).length > 3 ? (
                                        <Select
                                          defaultValue={score.stringValue}
                                          onValueChange={handleOnValueChange(
                                            score,
                                            index,
                                            (config.categories as ConfigCategory[]) ??
                                              [],
                                          )}
                                        >
                                          <SelectTrigger>
                                            <div className="text-xs">
                                              <SelectValue placeholder="Select category" />
                                            </div>
                                          </SelectTrigger>
                                          <SelectContent>
                                            {(
                                              (config.categories as ConfigCategory[]) ??
                                              []
                                            ).map(
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
                                          className={`grid grid-cols-${((config.categories as ConfigCategory[]) ?? [])?.length}`}
                                          onValueChange={handleOnValueChange(
                                            score,
                                            index,
                                            (config.categories as ConfigCategory[]) ??
                                              [],
                                          )}
                                        >
                                          {(
                                            (config.categories as ConfigCategory[]) ??
                                            []
                                          ).map((category: ConfigCategory) => (
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
                                          ))}
                                        </ToggleGroup>
                                      )}
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <Button
                                variant="ghost"
                                type="button"
                                className="px-0"
                                disabled={isScoreUnsaved(score.scoreId)}
                                loading={mutDeleteScore.isLoading}
                                onClick={async () => {
                                  if (score.scoreId)
                                    await mutDeleteScore.mutateAsync({
                                      id: score.scoreId,
                                      projectId,
                                    });
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
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
