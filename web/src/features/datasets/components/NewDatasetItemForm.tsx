import { Button } from "@/src/components/ui/button";
import * as z from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { api } from "@/src/utils/api";
import { useState } from "react";
import { CodeMirrorEditor } from "@/src/components/editor";
import { type Prisma } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  InputCommand,
  InputCommandEmpty,
  InputCommandGroup,
  InputCommandInput,
  InputCommandItem,
} from "@/src/components/ui/input-command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { DialogBody, DialogFooter } from "@/src/components/ui/dialog";

const formSchema = z.object({
  datasetIds: z.array(z.string()).min(1, "Select at least one dataset"),
  input: z.string().refine(
    (value) => {
      if (value === "") return true;
      try {
        JSON.parse(value);
        return true;
      } catch (error) {
        return false;
      }
    },
    {
      message:
        "Invalid input. Please provide a JSON object or double-quoted string.",
    },
  ),
  expectedOutput: z.string().refine(
    (value) => {
      if (value === "") return true;
      try {
        JSON.parse(value);
        return true;
      } catch (error) {
        return false;
      }
    },
    {
      message:
        "Invalid input. Please provide a JSON object or double-quoted string.",
    },
  ),
  metadata: z.string().refine(
    (value) => {
      if (value === "") return true;
      try {
        JSON.parse(value);
        return true;
      } catch (error) {
        return false;
      }
    },
    {
      message:
        "Invalid input. Please provide a JSON object or double-quoted string.",
    },
  ),
});

const formatJsonValue = (value: Prisma.JsonValue | undefined): string => {
  if (value === undefined) return "";

  if (typeof value === "string") {
    try {
      // Parse the string and re-stringify with proper formatting
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // If it's not valid JSON, stringify the string itself
      return JSON.stringify(value, null, 2);
    }
  }
  return JSON.stringify(value, null, 2);
};

export const NewDatasetItemForm = (props: {
  projectId: string;
  traceId?: string;
  observationId?: string;
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  metadata?: Prisma.JsonValue;
  datasetId?: string;
  className?: string;
  onFormSuccess?: () => void;
  blockedDatasetIds?: string[];
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const capture = usePostHogClientCapture();
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      datasetIds: props.datasetId ? [props.datasetId] : [],
      input: formatJsonValue(props.input),
      expectedOutput: formatJsonValue(props.output),
      metadata: formatJsonValue(props.metadata),
    },
  });

  const datasets = api.datasets.allDatasetMeta.useQuery({
    projectId: props.projectId,
  });

  const utils = api.useUtils();
  const createManyDatasetItemsMutation =
    api.datasets.createManyDatasetItems.useMutation({
      onSuccess: () => utils.datasets.invalidate(),
      onError: (error) => setFormError(error.message),
    });

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (props.traceId) {
      capture("dataset_item:new_from_trace_form_submit", {
        object: props.observationId ? "observation" : "trace",
      });
    } else {
      capture("dataset_item:new_form_submit");
    }

    createManyDatasetItemsMutation
      .mutateAsync({
        projectId: props.projectId,
        items: values.datasetIds.map((datasetId) => ({
          datasetId,
          input: values.input,
          expectedOutput: values.expectedOutput,
          metadata: values.metadata,
          sourceTraceId: props.traceId,
          sourceObservationId: props.observationId,
        })),
      })
      .then(() => {
        props.onFormSuccess?.();
        form.reset();
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <Form {...form}>
      <form
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn("flex h-full flex-col gap-6", props.className)}
      >
        <DialogBody className="grid grid-rows-[auto,1fr]">
          <div className="flex-none">
            <FormField
              control={form.control}
              name="datasetIds"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Datasets</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between",
                            !field.value.length && "text-muted-foreground",
                          )}
                        >
                          {field.value.length > 0
                            ? `${field.value.length} dataset${field.value.length > 1 ? "s" : ""} selected`
                            : "Select datasets"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="p-0">
                      <InputCommand>
                        <InputCommandInput placeholder="Search datasets..." />
                        <InputCommandEmpty>
                          No datasets found.
                        </InputCommandEmpty>
                        <InputCommandGroup>
                          <ScrollArea className="h-fit">
                            {datasets.data
                              ?.filter(
                                (dataset) =>
                                  !props.blockedDatasetIds?.includes(
                                    dataset.id,
                                  ),
                              )
                              .map((dataset) => (
                                <InputCommandItem
                                  value={dataset.name}
                                  key={dataset.id}
                                  onSelect={() => {
                                    const newValue = field.value.includes(
                                      dataset.id,
                                    )
                                      ? field.value.filter(
                                          (id) => id !== dataset.id,
                                        )
                                      : [...field.value, dataset.id];
                                    field.onChange(newValue);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      field.value.includes(dataset.id)
                                        ? "opacity-100"
                                        : "opacity-0",
                                    )}
                                  />
                                  {dataset.name}
                                </InputCommandItem>
                              ))}
                          </ScrollArea>
                        </InputCommandGroup>
                      </InputCommand>
                    </PopoverContent>
                  </Popover>
                  {field.value.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {field.value.map((datasetId) => {
                        const dataset = datasets.data?.find(
                          (d) => d.id === datasetId,
                        );
                        return (
                          <Badge
                            key={datasetId}
                            variant="secondary"
                            className="mb-1 mr-1"
                          >
                            {dataset?.name || datasetId}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="ph-no-capture min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="input"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-2">
                    <FormLabel>Input</FormLabel>
                    <FormControl>
                      <CodeMirrorEditor
                        mode="json"
                        value={field.value}
                        onChange={field.onChange}
                        minHeight={200}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expectedOutput"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-2">
                    <FormLabel>Expected output</FormLabel>
                    <FormControl>
                      <CodeMirrorEditor
                        mode="json"
                        value={field.value}
                        onChange={field.onChange}
                        minHeight={200}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="metadata"
              render={({ field }) => (
                <FormItem className="mt-4 flex flex-col gap-2">
                  <FormLabel>Metadata</FormLabel>
                  <FormControl>
                    <CodeMirrorEditor
                      mode="json"
                      value={field.value}
                      onChange={field.onChange}
                      minHeight={100}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex flex-col gap-4">
            <Button
              type="submit"
              loading={createManyDatasetItemsMutation.isLoading}
              className="w-full"
              disabled={form.watch("datasetIds").length === 0}
            >
              Add to dataset{form.watch("datasetIds").length > 1 ? "s" : ""}
            </Button>
            {formError ? (
              <p className="text-red mt-2 text-center">
                <span className="font-bold">Error:</span> {formError}
              </p>
            ) : null}
          </div>
        </DialogFooter>
      </form>
    </Form>
  );
};
