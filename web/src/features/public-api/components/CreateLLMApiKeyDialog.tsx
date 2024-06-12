import { PlusIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Switch } from "@/src/components/ui/switch";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { zodResolver } from "@hookform/resolvers/zod";
import { LLMAdapter } from "@langfuse/shared";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";

const formSchema = z
  .object({
    secretKey: z.string().min(1),
    provider: z.string().min(1),
    adapter: z.nativeEnum(LLMAdapter),
    baseURL: z.union([z.literal(""), z.string().url()]),
    withDefaultModels: z.boolean(),
    customModels: z.array(z.object({ value: z.string().min(1) })),
  })
  .refine((data) => data.withDefaultModels || data.customModels.length > 0, {
    message:
      "At least one custom model name is required when default models are disabled.",
    path: ["withDefaultModels"],
  });

export function CreateLLMApiKeyDialog() {
  const projectId = useProjectIdFromURL();
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const hasAccess = useHasAccess({
    projectId,
    scope: "llmApiKeys:create",
  });

  const existingKeys = api.llmApiKey.all.useQuery(
    {
      projectId: projectId as string,
    },
    { enabled: Boolean(projectId) },
  );

  const mutCreateLlmApiKey = api.llmApiKey.create.useMutation({
    onSuccess: () => utils.llmApiKey.invalidate(),
  });

  const mutTestLLMApiKey = api.llmApiKey.test.useMutation();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      adapter: LLMAdapter.OpenAI,
      provider: "",
      secretKey: "",
      baseURL: "",
      withDefaultModels: true,
      customModels: [],
    },
  });

  const currentAdapter = form.watch("adapter");

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "customModels",
  });

  if (!hasAccess) return null;

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!projectId) return console.error("No project ID found.");
    if (
      existingKeys?.data?.data.map((k) => k.provider).includes(values.provider)
    ) {
      form.setError("provider", {
        type: "manual",
        message: "There already exists an API key for this provider.",
      });
      return;
    }
    capture("project_settings:llm_api_key_create", {
      provider: values.provider,
    });

    const newKey = {
      projectId,
      secretKey: values.secretKey,
      provider: values.provider,
      adapter: values.adapter,
      baseURL: values.baseURL || undefined,
      withDefaultModels: values.withDefaultModels,
      customModels: values.customModels
        .map((m) => m.value.trim())
        .filter(Boolean),
    };

    try {
      const testResult = await mutTestLLMApiKey.mutateAsync(newKey);

      if (!testResult.success) throw new Error(testResult.error);
    } catch (error) {
      console.error(error);
      form.setError("secretKey", {
        type: "manual",
        message:
          error instanceof Error
            ? error.message
            : "Could not verify the API key.",
      });

      return;
    }

    return mutCreateLlmApiKey
      .mutateAsync(newKey)
      .then(() => {
        form.reset();
        setOpen(false);
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        form.reset();
        setOpen(isOpen);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" loading={mutCreateLlmApiKey.isLoading}>
          <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
          Add new LLM API key
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90%]  min-w-[40vw] overflow-auto">
        <DialogHeader>
          <DialogTitle>Add new LLM API key</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            className={cn("flex flex-col gap-6 overflow-auto pb-2 pl-1 pr-4")}
            onSubmit={form.handleSubmit(onSubmit)}
          >
            {/* Provider name */}
            <FormField
              control={form.control}
              name="provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provider name</FormLabel>
                  <FormDescription>
                    Name to identify the key within Langfuse.
                  </FormDescription>
                  <FormControl>
                    <Input {...field} placeholder="OpenAI" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* LLM adapter */}
            <FormField
              control={form.control}
              name="adapter"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>LLM adapter</FormLabel>
                  <FormDescription>
                    Schema that is accepted at that provider endpoint.
                  </FormDescription>
                  <Select
                    defaultValue={field.value}
                    onValueChange={(value) =>
                      field.onChange(value as LLMAdapter)
                    }
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a LLM provider" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(LLMAdapter).map((provider) => (
                        <SelectItem value={provider} key={provider}>
                          {provider}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* baseURL */}
            <FormField
              control={form.control}
              name="baseURL"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Base URL</FormLabel>
                  <FormDescription>
                    Leave blank to use the default base URL for the given LLM
                    adapter.
                  </FormDescription>

                  {currentAdapter === LLMAdapter.Azure && (
                    <FormDescription className="text-yellow-700">
                      For Azure, please add the base URL in the following
                      format:
                      https://&#123;instanceName&#125;.openai.azure.com/openai/deployments
                    </FormDescription>
                  )}

                  <FormControl>
                    <Input {...field} placeholder="default" />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />

            {/* API key */}
            <FormField
              control={form.control}
              name="secretKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Key</FormLabel>
                  <FormDescription>
                    Your API keys are stored encrypted on our servers.
                  </FormDescription>
                  <FormControl>
                    <Input placeholder="sk-proj-...Uwj9" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* With default models */}
            <FormField
              control={form.control}
              name="withDefaultModels"
              render={({ field }) => (
                <FormItem>
                  <span className="row flex">
                    <span className="flex-1">
                      <FormLabel>Enable default models</FormLabel>
                      <FormDescription>
                        Default models for the selected adapter will be
                        available in Langfuse features.
                      </FormDescription>
                      {currentAdapter === LLMAdapter.Azure && (
                        <FormDescription className="text-yellow-700">
                          Azure LLM adapter does not support default models.
                          Please add a custom model with your deployment name.
                        </FormDescription>
                      )}
                    </span>

                    <FormControl>
                      <Switch
                        disabled={currentAdapter === LLMAdapter.Azure}
                        checked={
                          currentAdapter === LLMAdapter.Azure
                            ? false
                            : field.value
                        }
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </span>

                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Custom model names */}
            <FormField
              control={form.control}
              name="customModels"
              render={() => (
                <FormItem>
                  <FormLabel>Custom models</FormLabel>
                  <FormDescription>
                    Custom model names accepted by given endpoint.
                  </FormDescription>
                  {currentAdapter === LLMAdapter.Azure && (
                    <FormDescription className="text-yellow-700">
                      {
                        "For Azure, the model name should be the same as the deployment name in Azure."
                      }
                    </FormDescription>
                  )}

                  {fields.map((customModel, index) => (
                    <span key={index} className="flex flex-row space-x-2">
                      <Input
                        {...form.register(`customModels.${index}.value`)}
                        placeholder={`Custom model name ${index + 1}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => remove(index)}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </span>
                  ))}

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => append({ value: "" })}
                    className="w-full"
                  >
                    <PlusIcon
                      className="-ml-0.5 mr-1.5 h-5 w-5"
                      aria-hidden="true"
                    />
                    Add custom model name
                  </Button>
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full"
              loading={form.formState.isSubmitting}
            >
              Save new LLM API key
            </Button>

            <FormMessage />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
