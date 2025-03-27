import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Textarea } from "@/src/components/ui/textarea";
import { api } from "@/src/utils/api";

import { CodeMirrorEditor } from "@/src/components/editor";
import { JSONSchemaFormSchema, type LlmTool } from "@langfuse/shared";

const formSchema = z.object({
  name: z
    .string()
    .regex(
      /^[a-z0-9_-]+$/,
      "Name must contain only lowercase letters, numbers, hyphens and underscores",
    )
    .min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  parameters: JSONSchemaFormSchema,
});

type FormValues = z.infer<typeof formSchema>;

type CreateOrEditLLMToolDialog = {
  children: React.ReactNode;
  projectId: string;
  onSave: (llmTool: LlmTool) => void;
  onDelete?: (llmTool: LlmTool) => void;
  existingLlmTool?: LlmTool;
  defaultValues?: {
    name: string;
    description: string;
    parameters: string;
  };
};

export const CreateOrEditLLMToolDialog: React.FC<CreateOrEditLLMToolDialog> = (
  props,
) => {
  const { children, projectId, onSave, existingLlmTool } = props;

  const utils = api.useUtils();
  const createLlmTool = api.llmTools.create.useMutation();
  const updateLlmTool = api.llmTools.update.useMutation();
  const deleteLlmTool = api.llmTools.delete.useMutation();

  const [open, setOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: props.defaultValues ?? {
      name: "",
      description: "",
      parameters: JSON.stringify(
        {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        },
        null,
        2,
      ),
    },
  });

  // Populate form when in edit mode
  useEffect(() => {
    if (existingLlmTool) {
      form.reset({
        name: existingLlmTool.name,
        description: existingLlmTool.description,
        parameters: JSON.stringify(existingLlmTool.parameters, null, 2),
      });
    }
  }, [existingLlmTool, form]);

  async function onSubmit(values: FormValues) {
    let result;
    if (existingLlmTool) {
      result = await updateLlmTool.mutateAsync({
        id: existingLlmTool.id,
        projectId,
        name: values.name,
        description: values.description,
        parameters: JSON.parse(values.parameters),
      });
    } else {
      result = await createLlmTool.mutateAsync({
        projectId,
        name: values.name,
        description: values.description,
        parameters: JSON.parse(values.parameters),
      });
    }

    await utils.llmTools.getAll.invalidate({ projectId });

    onSave(result);
    setOpen(false);
  }

  async function handleDelete() {
    if (!existingLlmTool) return;

    await deleteLlmTool.mutateAsync({
      id: existingLlmTool.id,
      projectId,
    });

    props.onDelete?.(existingLlmTool);

    await utils.llmTools.getAll.invalidate({ projectId });
    setOpen(false);
  }

  const prettifyJson = () => {
    try {
      const currentValue = form.getValues("parameters");
      const parsedJson = JSON.parse(currentValue);
      const prettified = JSON.stringify(parsedJson, null, 2);
      form.setValue("parameters", prettified);
    } catch (error) {
      console.error("Failed to prettify JSON:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:min-w-[32rem] md:min-w-[40rem]">
        <DialogHeader>
          <DialogTitle>
            {existingLlmTool ? "Edit LLM Tool" : "Create LLM Tool"}
          </DialogTitle>
          <DialogDescription>
            Define a tool for LLM function calling
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., get_weather" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormDescription>
                    This description will be sent to the LLM to help it
                    understand the tool&apos;s purpose and functionality.
                  </FormDescription>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the tool's purpose and usage"
                      className="min-h-[80px] focus:ring-0 focus:ring-offset-0"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="parameters"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Parameters (JSON Schema)</FormLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={prettifyJson}
                      className="text-xs"
                    >
                      Prettify
                    </Button>
                  </div>
                  <FormControl>
                    <CodeMirrorEditor
                      value={field.value}
                      onChange={field.onChange}
                      mode="json"
                      minHeight={200}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Parameters must be a valid JSON Schema object
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="mb-4">
              <p className="text-xs text-muted-foreground">
                Note: Changes to tools are reflected to all members of this
                project.
              </p>
            </div>
            <DialogFooter>
              {existingLlmTool && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  className="mr-auto"
                >
                  Delete
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
