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

import { type LlmSchema } from "@langfuse/shared";
import { CodeMirrorEditor } from "@/src/components/editor";

const formSchema = z.object({
  name: z
    .string()
    .regex(
      /^[a-z0-9_-]+$/,
      "Name must contain only lowercase letters, numbers, hyphens and underscores",
    )
    .min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  schema: z.string().refine(
    (value) => {
      try {
        const parsed = JSON.parse(value);

        const validateJsonSchema = (schema: unknown): string | null => {
          if (!schema || typeof schema !== "object") {
            return "Schema must be an object";
          }

          if (!("type" in schema) || schema.type !== "object") {
            return "Schema must have 'type' property set to 'object'";
          }

          if (
            !("properties" in schema) ||
            typeof schema.properties !== "object"
          ) {
            return "Schema must have 'properties' object";
          }

          return null;
        };

        return validateJsonSchema(parsed) === null;
      } catch {
        return false;
      }
    },
    {
      message: "Parameters must be a valid JSON Schema object",
    },
  ),
});

type FormValues = z.infer<typeof formSchema>;

type CreateOrEditLLMSchemaDialog = {
  children: React.ReactNode;
  projectId: string;
  onSave: (llmSchema: LlmSchema) => void;
  onDelete?: (llmSchema: LlmSchema) => void;
  llmSchema?: LlmSchema;
  defaultValues?: {
    name: string;
    description: string;
    schema: string;
  };
};

export const CreateOrEditLLMSchemaDialog: React.FC<
  CreateOrEditLLMSchemaDialog
> = (props) => {
  const { children, projectId, onSave, llmSchema } = props;

  const utils = api.useUtils();
  const createLlmSchema = api.llmSchemas.create.useMutation();
  const updateLlmSchema = api.llmSchemas.update.useMutation();
  const deleteLlmSchema = api.llmSchemas.delete.useMutation();

  const [open, setOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: props.defaultValues ?? {
      name: "",
      description: "",
      schema: JSON.stringify(
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
    if (llmSchema) {
      form.reset({
        name: llmSchema.name,
        description: llmSchema.description,
        schema: JSON.stringify(llmSchema.schema, null, 2),
      });
    }
  }, [llmSchema, form]);

  async function onSubmit(values: FormValues) {
    let result;
    if (llmSchema) {
      result = await updateLlmSchema.mutateAsync({
        id: llmSchema.id,
        projectId,
        name: values.name,
        description: values.description,
        schema: JSON.parse(values.schema),
      });
    } else {
      result = await createLlmSchema.mutateAsync({
        projectId,
        name: values.name,
        description: values.description,
        schema: JSON.parse(values.schema),
      });
    }

    await utils.llmSchemas.getAll.invalidate({ projectId });

    onSave(result);
    setOpen(false);
  }

  async function handleDelete() {
    if (!llmSchema) return;

    await deleteLlmSchema.mutateAsync({
      id: llmSchema.id,
      projectId,
    });

    props.onDelete?.(llmSchema);

    await utils.llmSchemas.getAll.invalidate({ projectId });
    setOpen(false);
  }

  const prettifyJson = () => {
    try {
      const currentValue = form.getValues("schema");
      const parsedJson = JSON.parse(currentValue);
      const prettified = JSON.stringify(parsedJson, null, 2);
      form.setValue("schema", prettified);
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
            {llmSchema ? "Edit LLM Schema" : "Create LLM Schema"}
          </DialogTitle>
          <DialogDescription>
            Define a JSON Schema for LLM tools or structured outputs
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
                    When this schema is used as a tool, this description will be
                    sent to the LLM to help it understand the tool&apos;s
                    purpose and functionality.
                  </FormDescription>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the schema"
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
              name="schema"
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
                Note: Changes to schemas are reflected to all members of this
                project.
              </p>
            </div>
            <DialogFooter>
              {llmSchema && (
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
