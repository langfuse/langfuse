import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Switch } from "@/src/components/ui/switch";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Alert, AlertDescription } from "@/src/components/ui/alert";

const formSchema = z
  .object({
    baseURL: z.union([z.literal(""), z.string().url()]),
    withDefaultModels: z.boolean(),
    customModels: z.array(z.object({ value: z.string().min(1) })),
  })
  .refine((data) => data.withDefaultModels || data.customModels.length > 0, {
    message:
      "At least one custom model name is required when default models are disabled.",
    path: ["withDefaultModels"],
  });

type FormValues = z.infer<typeof formSchema>;

interface EditLLMApiKeyDialogProps {
  projectId: string;
  llmApiKey: {
    id: string;
    provider: string;
    adapter: string;
    baseURL: string | null;
    withDefaultModels: boolean;
    customModels: string[];
    extraHeaderKeys: string[];
  };
}

export function EditLLMApiKeyDialog({
  projectId,
  llmApiKey,
}: EditLLMApiKeyDialogProps) {
  const [open, setOpen] = useState(false);
  const [isTestingModel, setIsTestingModel] = useState(false);
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "llmApiKeys:update",
  });

  const updateLlmApiKey = api.llmApiKey.update.useMutation({
    onSuccess: () => {
      utils.llmApiKey.invalidate();
      setOpen(false);
      capture("project_settings:llm_api_key_edit");
    },
  });

  const testLlmApiKey = api.llmApiKey.testWithExistingKey.useMutation();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      baseURL: llmApiKey.baseURL || "",
      withDefaultModels: llmApiKey.withDefaultModels,
      customModels: llmApiKey.customModels.map((model) => ({ value: model })),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "customModels",
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        baseURL: llmApiKey.baseURL || "",
        withDefaultModels: llmApiKey.withDefaultModels,
        customModels: llmApiKey.customModels.map((model) => ({ value: model })),
      });
    }
  }, [open, llmApiKey, form]);

  async function onSubmit(values: FormValues) {
    const customModels = values.customModels
      .map((m) => m.value.trim())
      .filter(Boolean);

    // Test if the new models work
    // We need to test with at least one model - preferably a new one
    const modelsToTest = customModels.filter(
      (model) => !llmApiKey.customModels.includes(model),
    );
    const modelToTest =
      modelsToTest.length > 0 ? modelsToTest[0] : customModels[0];

    if (modelToTest) {
      setIsTestingModel(true);
      try {
        const testResult = await testLlmApiKey.mutateAsync({
          projectId,
          id: llmApiKey.id,
          model: modelToTest,
        });

        if (!testResult.success) {
          form.setError("root", {
            type: "manual",
            message: `Model "${modelToTest}" test failed: ${testResult.error || "Unknown error"}`,
          });
          setIsTestingModel(false);
          return;
        }
      } catch (error) {
        console.error("Test error:", error);
        form.setError("root", {
          type: "manual",
          message:
            "Failed to test the model. Please check if the model name is correct.",
        });
        setIsTestingModel(false);
        return;
      }
      setIsTestingModel(false);
    }

    await updateLlmApiKey.mutateAsync({
      id: llmApiKey.id,
      projectId,
      baseURL: values.baseURL || null,
      withDefaultModels: values.withDefaultModels,
      customModels,
    });
  }

  if (!hasAccess) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <PencilIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90%] overflow-auto">
        <DialogHeader>
          <DialogTitle>Edit LLM Connection</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                <strong>Provider:</strong> {llmApiKey.provider}
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Adapter:</strong> {llmApiKey.adapter}
              </p>
            </div>

            <FormField
              control={form.control}
              name="baseURL"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Base URL</FormLabel>
                  <FormDescription>
                    Leave blank to use the default base URL for the adapter.
                  </FormDescription>
                  <FormControl>
                    <Input {...field} placeholder="default" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="withDefaultModels"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Use default models</FormLabel>
                    <FormDescription>
                      Include default models for this adapter in addition to
                      custom ones.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="customModels"
              render={() => (
                <FormItem>
                  <FormLabel>Custom models</FormLabel>
                  <FormDescription>
                    Custom model names accepted by the endpoint.
                  </FormDescription>
                  {fields.map((customModel, index) => (
                    <span
                      key={customModel.id}
                      className="flex flex-row space-x-2"
                    >
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

            <Alert>
              <AlertDescription>
                New models will be tested before saving to ensure they are valid
                and accessible.
              </AlertDescription>
            </Alert>

            <Button
              type="submit"
              loading={
                form.formState.isSubmitting ||
                updateLlmApiKey.isLoading ||
                isTestingModel
              }
              className="w-full"
            >
              {isTestingModel ? "Testing Model..." : "Save Changes"}
            </Button>

            {form.formState.errors.root && (
              <FormMessage>{form.formState.errors.root.message}</FormMessage>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
