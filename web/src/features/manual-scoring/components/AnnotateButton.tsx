import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import React, { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { LockIcon, X } from "lucide-react";
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
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
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

const score = z.object({
  id: z.string().optional(),
  name: z.string(),
  value: z.coerce.number(),
  stringValue: z.string().optional(),
  dataType: z.nativeEnum(ScoreDataType),
  configId: z.string().optional(),
  isDeleted: z.boolean(),
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

  // replace current default values with trpc call to fetch data
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
          id: s.id,
          name: s.name,
          value: s.value,
          stringValue: s.stringValue ?? undefined,
          dataType: s.dataType,
          configId: s.configId ?? undefined,
          isDeleted: false,
        })),
    },
  });

  const hasAccess = useHasAccess({
    projectId,
    scope: "scores:CUD",
  });

  const { fields, append, update, remove } = useFieldArray({
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

  async function onSubmit(values: z.infer<typeof formSchema>) {
    // capture("eval_config:new_form_submit");
  }

  function handleOnCheckedChange(config: ScoreConfig, value: CheckedState) {
    const isOriginalScore = form.formState.defaultValues?.scoreData?.some(
      (score) => !!score && score.configId === config.id,
    );
    const index = fields.findIndex((field) => field.configId === config.id);

    if (isOriginalScore) {
      update(index, {
        ...fields[index],
        isDeleted: !value,
      });
      return;
    }

    value
      ? append({
          name: config.name,
          value: 0,
          dataType: config.dataType,
          configId: config.id,
          isDeleted: false,
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
                  <PopoverContent className="max-h-96 overflow-y-auto">
                    <div className="flex flex-col space-y-4">
                      <div className="flex items-center justify-between">
                        <>
                          <Link
                            className="sticky top-0 z-50 inline-block
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
                              (field) =>
                                field.configId === config.id &&
                                !field.isDeleted,
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
            <form
              // eslint-disable-next-line @typescript-eslint/no-misused-promises
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
            >
              <div className="grid grid-flow-row gap-2 px-4">
                <FormField
                  control={form.control}
                  name="scoreData"
                  render={() => (
                    <>
                      <FormControl>
                        Here will some variable mapping be added.
                      </FormControl>
                      {fields.map((score, index) =>
                        score.isDeleted ? null : (
                          <div
                            key={`${score.id}-langfuseObject`}
                            className="grid grid-cols-[auto,1fr,auto] items-center gap-2 text-left"
                          >
                            <div className="h-4 w-4 shrink-0 rounded-sm bg-primary-accent" />
                            <span className="text-sm">{score.name}</span>
                            <FormField
                              control={form.control}
                              name={`scoreData.${index}.value`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input {...field} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                        ),
                      )}
                    </>
                  )}
                />
              </div>
            </form>
          </Form>
          <DrawerFooter>
            <Button>Submit</Button>
            <DrawerClose asChild>
              <Button variant="outline" onClick={() => setIsPopoverOpen(false)}>
                Cancel
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
