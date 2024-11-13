import React, { useEffect } from "react";
import { Button } from "@/src/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Form } from "@/src/components/ui/form";
import { Textarea } from "@/src/components/ui/textarea";
import {
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
  Command,
  CommandItem,
} from "@/src/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { z } from "zod";
import { cn } from "@/src/utils/tailwind";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  ChevronDown,
  CheckIcon,
  Info,
  CircleCheck,
  Loader2,
} from "lucide-react";
import { api } from "@/src/utils/api";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";

const CreateExperimentData = z.object({
  promptId: z.string().min(1, "Please select a prompt"),
  datasetId: z.string().min(1, "Please select a dataset"),
  description: z.string().max(1000).optional(),
});

export type CreateExperiment = z.infer<typeof CreateExperimentData>;

export const CreateExperimentsForm = ({ projectId }: { projectId: string }) => {
  // Only track what we need for UI state
  const [open, setOpen] = React.useState(false);
  const [selectedPromptName, setSelectedPromptName] = React.useState<string>();
  const [selectedPromptVersion, setSelectedPromptVersion] =
    React.useState<number>();

  const form = useForm<CreateExperiment>({
    resolver: zodResolver(CreateExperimentData),
    defaultValues: {
      promptId: "",
      datasetId: "",
    },
  });

  const onSubmit = (data: CreateExperiment) => {
    // TODO: implement
    console.log(data);
  };

  const promptNamesAndVersions = api.prompts.allNamesAndVersions.useQuery({
    projectId,
  });

  const datasets = api.datasets.allDatasetMeta.useQuery(
    {
      projectId,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const promptId = form.watch("promptId");
  const datasetId = form.watch("datasetId");

  const validationResult = api.experiments.validateConfig.useQuery(
    {
      projectId,
      promptId: promptId as string,
      datasetId: datasetId as string,
    },
    {
      enabled: Boolean(promptId && datasetId),
    },
  );

  // Watch for changes to promptId or datasetId and show form errors if invalid
  useEffect(() => {
    if (validationResult.data) {
      console.log("Validation result:", validationResult.data);
    }
  }, [validationResult.data]);

  if (!promptNamesAndVersions.data || !datasets.data) {
    return null;
  }

  const promptsByName = promptNamesAndVersions.data.reduce<
    Record<string, Array<{ version: number; id: string }>>
  >((acc, prompt) => {
    if (!acc[prompt.name]) {
      acc[prompt.name] = [];
    }
    acc[prompt.name].push({ version: prompt.version, id: prompt.id });
    return acc;
  }, {});

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (optional)</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Add description..."
                  className="focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 active:ring-0"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="promptId"
          render={() => (
            <FormItem>
              <FormLabel>Prompt</FormLabel>
              {/* FIX: I need the command list in the popover to be scrollable, currently it's not */}
              <div className="mb-2 flex gap-2">
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={open}
                      className="w-2/3 justify-between px-2 font-normal"
                    >
                      {selectedPromptName || "Select a prompt"}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] overflow-auto p-0"
                    align="start"
                  >
                    <Command>
                      <CommandInput
                        placeholder="Search prompts..."
                        className="h-9"
                      />
                      <CommandList>
                        <CommandEmpty>No prompt found.</CommandEmpty>
                        <CommandGroup>
                          {Object.entries(promptsByName).map(
                            ([name, promptData]) => (
                              <CommandItem
                                key={name}
                                onSelect={() => {
                                  setSelectedPromptName(name);
                                  const latestVersion = promptData[0];
                                  setSelectedPromptVersion(
                                    latestVersion.version,
                                  );
                                  form.setValue("promptId", latestVersion.id);
                                  form.clearErrors("promptId");
                                }}
                              >
                                {name}
                                <CheckIcon
                                  className={cn(
                                    "ml-auto h-4 w-4",
                                    name === selectedPromptName
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                              </CommandItem>
                            ),
                          )}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      disabled={!selectedPromptName}
                      variant="outline"
                      role="combobox"
                      className="w-1/3 justify-between px-2 font-normal"
                    >
                      {selectedPromptVersion
                        ? `Version ${selectedPromptVersion}`
                        : "Version"}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                  >
                    <Command>
                      <CommandList>
                        <CommandEmpty>No version found.</CommandEmpty>
                        <CommandGroup className="overflow-y-auto">
                          {selectedPromptName &&
                          promptsByName[selectedPromptName] ? (
                            promptsByName[selectedPromptName].map((prompt) => (
                              <CommandItem
                                key={prompt.id}
                                onSelect={() => {
                                  setSelectedPromptVersion(prompt.version);
                                  form.setValue("promptId", prompt.id);
                                  form.clearErrors("promptId");
                                }}
                              >
                                Version {prompt.version}
                                <CheckIcon
                                  className={cn(
                                    "ml-auto h-4 w-4",
                                    prompt.version === selectedPromptVersion
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                              </CommandItem>
                            ))
                          ) : (
                            <CommandItem disabled>
                              No versions available
                            </CommandItem>
                          )}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="datasetId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Dataset</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a dataset" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {datasets.data?.map((dataset) => (
                    <SelectItem value={dataset.id} key={dataset.id}>
                      {dataset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="mt-4 flex flex-col gap-4">
          {validationResult.isLoading && Boolean(promptId && datasetId) && (
            <Card className="relative overflow-hidden rounded-md shadow-none group-data-[collapsible=icon]:hidden">
              <CardHeader className="p-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>Validating configuration...</span>
                  <Loader2 className="h-3 w-3 animate-spin" />
                </CardTitle>
                <CardDescription className="text-foreground">
                  Checking dataset items against prompt variables
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          {validationResult.data?.isValid === false && (
            <Card className="relative overflow-hidden rounded-md border-dark-yellow bg-light-yellow shadow-none group-data-[collapsible=icon]:hidden">
              <CardHeader className="p-2">
                <CardTitle className="flex items-center justify-between text-sm text-dark-yellow">
                  <span>Invalid configuration</span>
                  {/* TODO: add link to docs explaining error cases */}
                  <Info className="h-4 w-4" />
                </CardTitle>
                <CardDescription className="text-foreground">
                  {validationResult.data?.message}
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          {validationResult.data?.isValid === true && (
            <Card className="relative overflow-hidden rounded-md border-dark-green bg-light-green shadow-none group-data-[collapsible=icon]:hidden">
              <CardHeader className="p-2">
                <CardTitle className="flex items-center justify-between text-sm text-dark-green">
                  <span>Valid configuration</span>
                  <CircleCheck className="h-4 w-4" />
                </CardTitle>
                <CardDescription className="text-foreground">
                  Matches between dataset items and prompt variables
                  <ul className="ml-2 list-inside list-disc">
                    {validationResult.data?.includesAll > 0 && (
                      <li key="includesAll">
                        Including all variables:{" "}
                        {validationResult.data?.includesAll} /{" "}
                        {validationResult.data?.totalItems}
                      </li>
                    )}
                    {validationResult.data?.includesSome > 0 && (
                      <li key="includesSome">
                        Includes some variables:{" "}
                        {validationResult.data?.includesSome}
                      </li>
                    )}
                    {validationResult.data?.missing > 0 && (
                      <li key="missing">
                        Missing variables: {validationResult.data?.missing}
                      </li>
                    )}
                  </ul>
                  {validationResult.data?.missing > 0 &&
                    "Items missing all prompt variables will be excluded from the experiment."}
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={
                Boolean(promptId && datasetId) &&
                !validationResult.data?.isValid
              }
              loading={form.formState.isSubmitting}
            >
              Create
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
};
