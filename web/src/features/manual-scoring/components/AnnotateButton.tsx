import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import React, { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { LockIcon, MessageCircle, TrashIcon, X } from "lucide-react";
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
import Link from "next/link";
import {
  Drawer,
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
import { cn } from "@/src/utils/tailwind";
import { Textarea } from "@/src/components/ui/textarea";

type ConfigCategory = {
  label: string;
  value: string;
};

const score = z.object({
  scoreId: z.string().optional(),
  name: z.string(),
  value: z.number().optional(),
  stringValue: z.string().optional(),
  dataType: z.nativeEnum(ScoreDataType),
  configId: z.string().optional(),
  comment: z.string().optional(),
});

const formSchema = z.object({
  scoreData: z.array(score),
});

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
}: {
  traceId: string;
  scores: Score[];
  observationId?: string;
  projectId: string;
}) {
  const [isConfigPopoverOpen, setIsConfigPopoverOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      scoreData: scores
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
        })),
    },
  });

  const hasAccess = useHasAccess({
    projectId,
    scope: "scores:CUD",
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "scoreData",
  });

  const configs = api.scoreConfigs.all.useQuery(
    {
      projectId,
    },
    {
      enabled: hasAccess,
    },
  );

  const mutDeleteScore = api.scores.deleteAnnotationScore.useMutation({
    onMutate: async () => {
      // setIsLoading(true);
      // Snapshot the previous value
      // return { prev };
    },
    onError: (err, _newTags, context) => {
      // setIsLoading(false);
      // Rollback to the previous value if mutation fails
      // we should also set form error here
    },
    onSettled: async (data, error) => {
      if (!data || error) return; // handle error

      const { id } = data;
      const updatedScoreIndex = fields.findIndex(
        (field) => field.scoreId === id,
      );
      remove(updatedScoreIndex);
    },
  });

  const mutScores = api.scores.annotate.useMutation({
    onMutate: async () => {
      // setIsLoading(true);
      // Snapshot the previous value
      // return { prev };
    },
    onError: (err, _newTags, context) => {
      // setIsLoading(false);
      // Rollback to the previous value if mutation fails
      // we should also set form error here
    },
    onSettled: (data, error) => {
      if (!data || error) return; // handle error

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
    },
  });

  function getConfigCategories(score: any): ConfigCategory[] {
    return (
      (configs.data?.configs.find((config) => config.id === score.configId)
        ?.categories as ConfigCategory[]) ?? []
    );
  }

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
    score: any,
    index: number,
  ): ((value: string) => void) | undefined {
    return async (stringValue) => {
      const selectedCategory = getConfigCategories(score).find(
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

  console.log({ fields });

  return (
    <Drawer onClose={() => setIsConfigPopoverOpen(false)}>
      <DrawerTrigger asChild>
        <Button variant="secondary" disabled={!hasAccess}>
          <span>Annotate</span>
          {!hasAccess ? <LockIcon className="ml-2 h-3 w-3" /> : null}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full">
          <DrawerHeader>
            <DrawerTitle>
              <div className="flex items-center justify-between">
                <span>Annotate</span>
                <Popover open={isConfigPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="secondary"
                      disabled={!hasAccess}
                      onClick={() => setIsConfigPopoverOpen(true)}
                    >
                      Add score
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent>
                    <div className="flex flex-col space-y-4">
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
                            className="flex w-fit"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      </div>
                      <div className="flex h-1 bg-muted" />
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
                  </PopoverContent>
                </Popover>
              </div>
            </DrawerTitle>
            <DrawerDescription>
              Add scores to your observations/traces
            </DrawerDescription>
          </DrawerHeader>
          <Form {...form}>
            <form className="flex flex-col gap-4">
              <div className="grid grid-flow-row gap-2 px-4">
                <FormField
                  control={form.control}
                  name="scoreData"
                  render={() => (
                    <>
                      <FormControl>
                        Here will some variable mapping be added.
                      </FormControl>
                      {fields.map((score, index) => (
                        <div
                          key={score.id}
                          className="grid grid-cols-[auto,1fr,2fr,auto,auto] items-center gap-2 text-left"
                        >
                          <div className="h-4 w-4 shrink-0 rounded-sm bg-primary-accent" />
                          <span className="text-sm">{score.name}</span>
                          <FormField
                            control={form.control}
                            name={`scoreData.${index}.value`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  {score.dataType === ScoreDataType.NUMERIC ? (
                                    <Input
                                      {...field}
                                      onBlur={async () => {
                                        if (!!field.value)
                                          await mutScores.mutateAsync({
                                            projectId,
                                            traceId,
                                            ...score,
                                            observationId,
                                            value: Number(field.value),
                                            id: score.scoreId,
                                          });
                                      }}
                                    />
                                  ) : (
                                    <Select
                                      defaultValue={score.stringValue}
                                      onValueChange={handleOnValueChange(
                                        score,
                                        index,
                                      )}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select category" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {getConfigCategories(score).map(
                                          (category) => (
                                            <SelectItem
                                              key={category.value}
                                              value={category.label}
                                            >
                                              {category.label}
                                            </SelectItem>
                                          ),
                                        )}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </FormControl>
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
                                            onClick={async () => {
                                              if (
                                                !!field.value &&
                                                !!score.scoreId &&
                                                !!score.value
                                              )
                                                await mutScores.mutateAsync({
                                                  projectId,
                                                  traceId,
                                                  ...score,
                                                  value: score.value,
                                                  id: score.scoreId,
                                                  observationId,
                                                  comment: field.value,
                                                });
                                            }}
                                          >
                                            Save comment
                                          </Button>
                                          <Button
                                            variant="secondary"
                                            type="button"
                                            disabled={isScoreUnsaved(
                                              score.scoreId,
                                            )}
                                            onClick={async () => {
                                              if (
                                                !!field.value &&
                                                !!score.scoreId &&
                                                !!score.value
                                              )
                                                await mutScores.mutateAsync({
                                                  projectId,
                                                  traceId,
                                                  ...score,
                                                  value: score.value,
                                                  id: score.scoreId,
                                                  observationId,
                                                  comment: null,
                                                });
                                            }}
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
                          <Button
                            variant="outline"
                            size="icon"
                            type="button"
                            disabled={isScoreUnsaved(score.scoreId)}
                            onClick={async () => {
                              // capture("scores:delete_form_open", {
                              //   source: "annotation",
                              // });
                              if (score.scoreId)
                                await mutDeleteScore.mutateAsync({
                                  id: score.scoreId,
                                  projectId,
                                });
                            }}
                          >
                            <TrashIcon className={cn("h-4 w-4 ")} />
                          </Button>
                        </div>
                      ))}
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
