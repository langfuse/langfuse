import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import React, { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { LockIcon, MessageCircle, TrashIcon, X } from "lucide-react";
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
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/src/components/ui/drawer";
import {
  ScoreDataType,
  type Score,
  ScoreSource,
  type ScoreConfig,
} from "@langfuse/shared";
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

type ConfigCategory = {
  label: string;
  value: string;
};

function getScoreData(
  scores: Score[],
  traceId: string,
  observationId?: string,
  configs?: ScoreConfig[],
) {
  const populatedScores = scores
    .filter(
      (s) =>
        s.source === ScoreSource.ANNOTATION &&
        s.traceId === traceId &&
        (observationId !== undefined
          ? s.observationId === observationId
          : s.observationId === null),
    )
    .map((s) => ({
      scoreId: s.id,
      name: s.name,
      value: s.value,
      dataType: s.dataType,
      stringValue: s.stringValue ?? undefined,
      configId: s.configId ?? undefined,
      comment: s.comment ?? undefined,
    }));

  console.log(populatedScores, configs);

  if (!configs) return populatedScores;

  const emptyScores = configs
    .filter((config) => !populatedScores.some((s) => s.configId === config.id))
    .map((config) => ({
      name: config.name,
      dataType: config.dataType,
      configId: config.id,
    }));

  return [...populatedScores, ...emptyScores];
}

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

function isPresent<T>(value: T) {
  return value !== null && value !== undefined && value !== "";
}

function isScoreUnsaved(scoreId?: string): boolean {
  return !scoreId;
}

export function AnnotateButton({
  traceId,
  scores,
  observationId,
  projectId,
  variant = "button",
}: {
  traceId: string;
  scores: Score[];
  observationId?: string;
  projectId: string;
  variant?: "button" | "badge";
}) {
  const [isConfigPopoverOpen, setIsConfigPopoverOpen] = useState(false);

  const hasAccess = useHasAccess({
    projectId,
    scope: "scores:CUD",
  });

  const configs = api.scoreConfigs.all.useQuery(
    {
      projectId,
    },
    {
      enabled: hasAccess,
    },
  );

  const form = useForm<z.infer<typeof AnnotateFormSchema>>({
    resolver: zodResolver(AnnotateFormSchema),
    defaultValues: {
      scoreData: getScoreData(
        scores,
        traceId,
        observationId,
        configs.data?.configs,
      ),
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

      const { id } = data;
      const updatedScoreIndex = fields.findIndex(
        (field) => field.scoreId === id,
      );
      remove(updatedScoreIndex);

      await Promise.all([
        utils.scores.invalidate(),
        utils.traces.invalidate(),
        utils.sessions.invalidate(),
      ]);
    },
  });

  const utils = api.useUtils();
  const mutScores = api.scores.annotate.useMutation({
    onError: (error) => {
      trpcErrorToast(error);
    },
    onSettled: async (data, error) => {
      if (!data || error) return;

      const { id, value, stringValue, name, dataType, configId, comment } =
        data;
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
    },
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

        if (!!stringValue)
          await mutScores.mutateAsync({
            projectId,
            traceId,
            observationId,
            ...score,
            id: score.scoreId,
            value: newValue,
            stringValue,
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
      if (!!field.value && !!score.scoreId && !!score.value)
        await mutScores.mutateAsync({
          projectId,
          traceId,
          ...score,
          value: score.value,
          id: score.scoreId,
          observationId,
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
      const { maxValue, minValue } = config;
      if (!maxValue || !minValue) return;

      if (Number(field.value) > maxValue || Number(field.value) < minValue) {
        form.setError(`scoreData.${index}.value`, {
          type: "custom",
          message: `Not in range: [${minValue},${maxValue}]`,
        });
        return;
      }

      form.clearErrors(`scoreData.${index}.value`);

      if (!!field.value)
        await mutScores.mutateAsync({
          projectId,
          traceId,
          ...score,
          observationId,
          value: Number(field.value),
          id: score.scoreId,
        });
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
      <DrawerContent>
        <div className="mx-auto max-h-64 w-full overflow-y-auto md:max-h-full">
          <DrawerHeader className="sticky top-0 z-10 bg-background">
            <DrawerTitle>
              <div className="flex items-center justify-between">
                <span>Annotate</span>
                <DrawerClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="flex w-fit"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </DrawerClose>
              </div>
            </DrawerTitle>
            <div className="grid grid-flow-col items-center">
              <DrawerDescription>
                Add scores to your observations/traces
              </DrawerDescription>
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
                      {configs.data?.configs.map((config) => (
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
                        const config = configs.data?.configs.find(
                          (config) => config.id === score.configId,
                        );
                        if (!config) return null;

                        return (
                          <div
                            key={score.id}
                            className="grid grid-cols-[1fr,1fr,auto,auto] items-stretch gap-2 text-left"
                          >
                            <HoverCard>
                              <HoverCardTrigger asChild>
                                <Link
                                  className="grid grid-cols-[auto,1fr] items-center gap-2 hover:text-accent-dark-blue hover:underline"
                                  href={`/project/${projectId}/settings`}
                                >
                                  <div className="h-4 w-4 shrink-0 rounded-sm bg-primary-accent" />
                                  <span className="text-sm">{score.name}</span>
                                </Link>
                              </HoverCardTrigger>
                              <HoverCardContent>
                                <ScoreConfigDetails
                                  configId={score.configId}
                                  configs={configs.data?.configs}
                                />
                              </HoverCardContent>
                            </HoverCard>
                            <FormField
                              control={form.control}
                              name={`scoreData.${index}.value`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    {score.dataType ===
                                    ScoreDataType.NUMERIC ? (
                                      <Input
                                        {...field}
                                        onBlur={handleOnBlur({
                                          config,
                                          field,
                                          index,
                                          score,
                                        })}
                                      />
                                    ) : (
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
                                          <SelectValue placeholder="Select category" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {(
                                            (config.categories as ConfigCategory[]) ??
                                            []
                                          ).map((category: ConfigCategory) => (
                                            <SelectItem
                                              key={category.value}
                                              value={category.label}
                                            >
                                              {category.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    )}
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  type="button"
                                >
                                  <MessageCircle className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent>
                                <FormField
                                  control={form.control}
                                  name={`scoreData.${index}.comment`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Comment (optional)</FormLabel>
                                      <FormControl>
                                        <>
                                          <Textarea
                                            {...field}
                                            value={field.value || ""}
                                          />
                                          <div className="mt-2 flex items-center justify-between">
                                            <Button
                                              variant="secondary"
                                              type="button"
                                              disabled={isScoreUnsaved(
                                                score.scoreId,
                                              )}
                                              loading={mutScores.isLoading}
                                              onClick={handleCommentUpdate({
                                                field,
                                                score,
                                                comment: field.value,
                                              })}
                                            >
                                              Save comment
                                            </Button>
                                            <Button
                                              variant="destructive"
                                              type="button"
                                              disabled={isScoreUnsaved(
                                                score.scoreId,
                                              )}
                                              loading={mutScores.isLoading}
                                              onClick={handleCommentUpdate({
                                                field,
                                                score,
                                                comment: null,
                                              })}
                                            >
                                              Delete
                                            </Button>
                                          </div>
                                        </>
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </PopoverContent>
                            </Popover>
                            <HoverCard>
                              <HoverCardTrigger>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  type="button"
                                  loading={mutDeleteScore.isLoading}
                                  disabled={isScoreUnsaved(score.scoreId)}
                                  onClick={async () => {
                                    if (score.scoreId)
                                      await mutDeleteScore.mutateAsync({
                                        id: score.scoreId,
                                        projectId,
                                      });
                                  }}
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </Button>
                              </HoverCardTrigger>
                              <HoverCardContent>
                                {isScoreUnsaved(score.scoreId) && (
                                  <div className="mr-2 mt-4 bg-background text-xs font-light">
                                    Deselect in score selection
                                  </div>
                                )}
                              </HoverCardContent>
                            </HoverCard>
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
