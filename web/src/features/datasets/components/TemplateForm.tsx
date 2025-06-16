import { Button } from "@/src/components/ui/button";
import * as z from "zod";
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
import { useState, useEffect } from "react";
import { CodeMirrorEditor } from "@/src/components/editor";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { DialogBody, DialogFooter } from "@/src/components/ui/dialog";

const formSchema = z.object({
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

export const TemplateForm = (props: {
  projectId: string;
  datasetId: string;
  className?: string;
  onFormSuccess?: () => void;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const capture = usePostHogClientCapture();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      input: "",
      expectedOutput: "",
      metadata: "",
    },
  });

  // 获取现有模板数据
  const { data: templateData, isLoading: isLoadingTemplate } =
    api.datasets.getTemplate.useQuery({
      projectId: props.projectId,
      datasetId: props.datasetId,
    });

  // 当模板数据加载完成时，更新表单默认值
  useEffect(() => {
    if (templateData) {
      form.reset({
        input: templateData.input
          ? JSON.stringify(templateData.input, null, 2)
          : "",
        expectedOutput: templateData.expectedOutput
          ? JSON.stringify(templateData.expectedOutput, null, 2)
          : "",
        metadata: templateData.metadata
          ? JSON.stringify(templateData.metadata, null, 2)
          : "",
      });
    }
  }, [templateData, form]);

  const utils = api.useUtils();
  const updateDatasetTemplateMutation = api.datasets.updateTemplate.useMutation(
    {
      onSuccess: () => {
        utils.datasets.invalidate();
        props.onFormSuccess?.();
      },
      onError: (error) => setFormError(error.message),
    },
  );

  function onSubmit(values: z.infer<typeof formSchema>) {
    capture("dataset:template_form_submit");

    updateDatasetTemplateMutation
      .mutateAsync({
        projectId: props.projectId,
        datasetId: props.datasetId,
        template: {
          input: values.input ? JSON.parse(values.input) : null,
          expectedOutput: values.expectedOutput
            ? JSON.parse(values.expectedOutput)
            : null,
          metadata: values.metadata ? JSON.parse(values.metadata) : null,
        },
      })
      .then(() => {
        props.onFormSuccess?.();
      })
      .catch((error) => {
        console.error(error);
      });
  }

  if (isLoadingTemplate) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading template...</div>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn("flex h-full flex-col gap-6", props.className)}
      >
        <DialogBody className="grid grid-rows-[auto,1fr]">
          <div className="ph-no-capture min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="input"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-2">
                    <FormLabel>Input Template</FormLabel>
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
                    <FormLabel>Expected Output Template</FormLabel>
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
                  <FormLabel>Metadata Template</FormLabel>
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
          <Button
            type="submit"
            loading={updateDatasetTemplateMutation.isLoading}
            className="w-full"
          >
            Save Template
          </Button>
          {formError ? (
            <p className="text-red mt-2 text-center">
              <span className="font-bold">Error:</span> {formError}
            </p>
          ) : null}
        </DialogFooter>
      </form>
    </Form>
  );
};
