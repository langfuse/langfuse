import { MinusCircle, PlusCircle, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod/v4";

import { CodeMirrorEditor } from "@/src/components/editor";
import { Button } from "@/src/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/src/components/ui/drawer";
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
import {
  type FormUpsertModel,
  FormUpsertModelSchema,
  type GetModelResult,
} from "@/src/features/models/validation";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/router";

import { PricePreview } from "./PricePreview";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

type UpsertModelDrawerProps =
  | {
      action: "create";
      children: React.ReactNode;
      projectId: string;
      prefilledModelData?: {
        modelName?: string;
        prices?: Record<string, number>;
      };
      className?: string;
    }
  | {
      action: "edit" | "clone";
      children: React.ReactNode;
      projectId: string;
      modelData: GetModelResult;
      className?: string;
    };

export const UpsertModelFormDrawer = ({
  children,
  ...props
}: UpsertModelDrawerProps) => {
  const capture = usePostHogClientCapture();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);

  let defaultValues: FormUpsertModel;
  if (props.action !== "create") {
    defaultValues = {
      modelName: props.modelData.modelName,
      matchPattern: props.modelData.matchPattern,
      tokenizerId: props.modelData.tokenizerId,
      tokenizerConfig: JSON.stringify(props.modelData.tokenizerConfig ?? {}),
      prices: props.modelData.prices,
    };
  } else {
    defaultValues = {
      modelName: props.prefilledModelData?.modelName ?? "",
      matchPattern: props.prefilledModelData?.modelName
        ? `(?i)^(${props.prefilledModelData?.modelName})$`
        : "",
      tokenizerId: null,
      tokenizerConfig: null,
      prices: props.prefilledModelData?.prices ?? {
        input: 0.000001,
        output: 0.000002,
      },
    };
  }

  const form = useForm({
    resolver: zodResolver(
      props.action === "edit"
        ? FormUpsertModelSchema.omit({ modelName: true }).extend({
            modelName: z.string().default(props.modelData.modelName),
          })
        : FormUpsertModelSchema,
    ),
    defaultValues,
  });
  const modelName = form.watch("modelName");
  const matchPattern = form.watch("matchPattern");
  const tokenizerId = form.watch("tokenizerId");

  // prefill match pattern if model name changes
  useEffect(() => {
    const getRegexString = (modelName: string) => `(?i)^(${modelName})$`;

    if (
      modelName &&
      (!matchPattern ||
        matchPattern === `(?i)^(${modelName.slice(0, -1)})$` ||
        matchPattern === `(?i)^(${modelName})$`)
    ) {
      form.setValue("matchPattern", getRegexString(modelName));
    }
  }, [modelName, matchPattern, form]);

  const upsertModelMutation = api.models.upsert.useMutation({
    onSuccess: (upsertedModel) => {
      utils.models.invalidate();
      form.reset();
      setOpen(false);
      showSuccessToast({
        title: `Model ${props.action === "edit" ? "updated" : "created"}`,
        description: `The model '${upsertedModel.modelName}' has been successfully ${props.action === "edit" ? "updated" : "created"}. New generations will use these model prices.`,
      });
      router.push(
        `/project/${props.projectId}/settings/models/${upsertedModel.id}`,
      );
    },
    onError: (error) => setFormError(error.message),
  });

  const onSubmit = async (values: FormUpsertModel) => {
    capture("models:new_form_submit");

    await upsertModelMutation
      .mutateAsync({
        modelId: props.action === "edit" ? props.modelData.id : null,
        projectId: props.projectId,
        modelName:
          props.action === "edit"
            ? props.modelData.modelName
            : values.modelName,
        matchPattern: values.matchPattern,
        prices: values.prices,
        tokenizerId: values.tokenizerId,
        tokenizerConfig:
          values.tokenizerConfig &&
          typeof JSON.parse(values.tokenizerConfig) === "object"
            ? (JSON.parse(values.tokenizerConfig) as Record<string, number>)
            : undefined,
      })
      .catch((error) => {
        setFormError(error.message);
      });
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(open) => {
        if (!open) return; // Only allow closing via cancel key
        setOpen(open);
      }}
      dismissible={false}
      onClose={() => {
        form.reset();
        setFormError(null);
      }}
    >
      <DrawerTrigger
        asChild
        onClick={() => setOpen(true)}
        className={props.className}
        title={
          props.action === "create"
            ? "Create model definition"
            : "Edit model definition"
        }
      >
        {children}
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-center justify-between">
            <DrawerTitle>
              {props.action === "create"
                ? "Create Model"
                : props.action === "clone"
                  ? "Clone Model"
                  : "Edit Model"}
            </DrawerTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X size={20} />
            </Button>
          </div>
          <DrawerDescription>
            {props.action === "edit"
              ? props.modelData.modelName
              : props.action === "create"
                ? "Create a new model configuration to track generation costs."
                : null}
          </DrawerDescription>
        </DrawerHeader>
        <Form {...form}>
          <form
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex h-full max-h-[100vh] flex-col gap-6 overflow-y-auto p-4 pt-0"
          >
            <FormField
              control={form.control}
              name="modelName"
              disabled={props.action === "edit"}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model Name</FormLabel>
                  <FormDescription>
                    The name of the model. This will be used to reference the
                    model in the API. You can track price changes of models by
                    using the same name and match pattern.
                  </FormDescription>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="matchPattern"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Match pattern</FormLabel>
                  <FormDescription>
                    Regular expression (Postgres syntax) to match ingested
                    generations (model attribute) to this model definition. For
                    an exact, case-insensitive match to a model name, use the
                    expression: (?i)^(modelname)$
                  </FormDescription>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="prices"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    Prices
                  </FormLabel>
                  <FormDescription>
                    Set prices per usage type for this model. Usage types must
                    exactly match the keys of the ingested usage details.
                  </FormDescription>
                  <span className="flex flex-col gap-2">
                    <FormDescription>
                      Prefill usage types from template:
                    </FormDescription>
                    <span className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          field.onChange({
                            input: 0,
                            output: 0,
                            input_cached_tokens: 0,
                            output_reasoning_tokens: 0,
                            ...field.value,
                          });
                        }}
                      >
                        OpenAI
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          field.onChange({
                            input: 0,
                            input_tokens: 0,
                            output: 0,
                            output_tokens: 0,
                            cache_creation_input_tokens: 0,
                            cache_read_input_tokens: 0,
                            ...field.value,
                          });
                        }}
                      >
                        Anthropic
                      </Button>
                    </span>
                  </span>
                  <FormControl>
                    <span className="flex flex-col gap-2">
                      <FormDescription className="grid grid-cols-2 gap-1">
                        <span>Usage type</span>
                        <span>Price</span>
                      </FormDescription>
                      {Object.entries(field.value).map(
                        ([key, value], index) => (
                          <div key={index} className="grid grid-cols-2 gap-1">
                            <Input
                              placeholder="Key (e.g. input, output)"
                              value={key}
                              onChange={(e) => {
                                const newPrices = { ...field.value };
                                const oldValue = newPrices[key];
                                delete newPrices[key];
                                newPrices[e.target.value] = oldValue;
                                field.onChange(newPrices);
                              }}
                            />
                            <div className="flex gap-1">
                              <Input
                                type="number"
                                placeholder="Price per unit"
                                value={value}
                                step="0.000001"
                                onChange={(e) => {
                                  field.onChange({
                                    ...field.value,
                                    [key]: parseFloat(e.target.value),
                                  });
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                title="Remove price"
                                size="icon"
                                onClick={() => {
                                  const newPrices = { ...field.value };
                                  delete newPrices[key];
                                  field.onChange(newPrices);
                                }}
                              >
                                <MinusCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ),
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          field.onChange({
                            ...field.value,
                            new_usage_type: 0.000001,
                          });
                        }}
                        className="flex items-center gap-1"
                      >
                        <PlusCircle className="h-4 w-4" />
                        <span>Add Price</span>
                      </Button>
                      <PricePreview prices={field.value} />
                    </span>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tokenizerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tokenizer</FormLabel>
                  <Select
                    onValueChange={(tokenizerId) => {
                      field.onChange(tokenizerId);
                      if (tokenizerId === "None") {
                        form.setValue("tokenizerConfig", "{}");
                      }
                    }}
                    defaultValue={field.value ?? "None"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a unit" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {["openai", "claude", "None"].map((unit) => (
                        <SelectItem value={unit} key={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Optionally, Langfuse can tokenize the input and output of a
                    generation if no unit counts are ingested. This is useful
                    for e.g. streamed OpenAI completions. For details on the
                    supported tokenizers, see the{" "}
                    <Link
                      href="https://langfuse.com/docs/model-usage-and-cost"
                      className="underline"
                      target="_blank"
                    >
                      docs
                    </Link>
                    .
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {tokenizerId && tokenizerId !== "None" && (
              <FormField
                control={form.control}
                name="tokenizerConfig"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tokenizer Config</FormLabel>
                    <CodeMirrorEditor
                      mode="json"
                      value={field.value ?? "{}"}
                      onChange={field.onChange}
                      minHeight="none"
                    />
                    <FormDescription>
                      The config for the tokenizer. Required for openai. See the{" "}
                      <Link
                        href="https://langfuse.com/docs/model-usage-and-cost"
                        className="underline"
                        target="_blank"
                      >
                        docs
                      </Link>{" "}
                      for details.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DrawerFooter className="flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="w-full"
              >
                Cancel
              </Button>

              <Button
                type="submit"
                className="w-full"
                loading={upsertModelMutation.isLoading}
              >
                Submit
              </Button>
            </DrawerFooter>
          </form>
          {formError ? (
            <p className="my-2 text-center text-sm font-medium text-destructive">
              <span className="font-semibold">Error:</span> {formError}
            </p>
          ) : null}
        </Form>
      </DrawerContent>
    </Drawer>
  );
};
