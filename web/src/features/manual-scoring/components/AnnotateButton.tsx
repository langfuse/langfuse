import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import React, { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { LockIcon, TrashIcon, X } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
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

type ConfigCategory = {
  label: string;
  value: string;
};

const score = z.object({
  scoreId: z.string().optional(),
  name: z.string(),
  value: z.number(),
  stringValue: z.string().optional(),
  dataType: z.nativeEnum(ScoreDataType),
  configId: z.string().optional(),
});

const formSchema = z.object({
  scoreData: z.array(score),
});

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
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

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

      const { id, value, stringValue, name, dataType, configId } = data;
      const updatedScoreIndex = fields.findIndex(
        (field) => field.configId === configId,
      );

      update(updatedScoreIndex, {
        scoreId: id,
        value,
        stringValue: stringValue ?? undefined,
        name,
        dataType,
        configId: configId ?? undefined,
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
          value: 0,
          dataType: config.dataType,
          configId: config.id,
        })
      : remove(index);
  }

  return (
    <Drawer onClose={() => setIsPopoverOpen(false)}>
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
                <Popover open={isPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="secondary"
                      disabled={!hasAccess}
                      onClick={() => setIsPopoverOpen(true)}
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
                            onClick={() => setIsPopoverOpen(false)}
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
                              (field) => field.configId === config.id,
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
                          className="grid grid-cols-[auto,1fr,2fr,auto] items-center gap-2 text-left"
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
                                      onValueChange={async (value) => {
                                        if (!!value)
                                          await mutScores.mutateAsync({
                                            projectId,
                                            traceId,
                                            ...score,
                                            observationId,
                                            value: Number(field.value),
                                            id: score.scoreId,
                                            stringValue: value,
                                          });
                                      }}
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
                          <Button
                            variant="outline"
                            size="icon"
                            type="button"
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
                            <TrashIcon
                              className={cn(
                                "h-4 w-4 text-muted-gray",
                                score.scoreId ? "text-gray" : "text-muted-gray",
                              )}
                            />
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
