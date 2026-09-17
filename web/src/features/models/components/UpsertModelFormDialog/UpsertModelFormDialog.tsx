/* eslint-disable @repo/no-abstracted-overlay-trigger */
/* eslint @repo/no-style-props: "off" */
import cloneDeep from "lodash/cloneDeep";
import isEqual from "lodash/isEqual";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { CodeMirrorEditor } from "@/src/components/editor";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogBody,
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
import { buildFormValues } from "@/src/features/models/fns/buildFormValues";
import { matchPatternFor } from "@/src/features/models/fns/matchPatternFor";
import { toPricingTierInputs } from "@/src/features/models/fns/toPricingTierInputs";
import {
  type FormUpsertModel,
  FormUpsertModelSchema,
  type GetModelResult,
} from "@/src/features/models/validation";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/router";

import { showSuccessToast } from "@/src/features/notifications";
import { PricingSection } from "@/src/features/models/components/PricingSection/PricingSection";

type UpsertModelDialogProps =
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

const DISCARD_CHANGES_MESSAGE =
  "Discard your unsaved changes to this model definition?";

export const UpsertModelFormDialog = (({
  children,
  ...props
}: UpsertModelDialogProps) => {
  const capture = usePostHogClientCapture();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(FormUpsertModelSchema),
    defaultValues: buildFormValues(props),
  });

  const tokenizerId = form.watch("tokenizerId");

  const upsertModelMutation = api.models.upsert.useMutation();

  const onSubmit = async (values: FormUpsertModel) => {
    capture("models:new_form_submit");
    setFormError(null);
    // Snapshot before the await: nothing typed while the save is in flight may
    // become part of the saved baseline, or the dirty guard would let it go.
    // getValues() copies only the top level, so the clone is load-bearing.
    const submitted = cloneDeep(form.getValues());

    try {
      const upsertedModel = await upsertModelMutation.mutateAsync({
        modelId: props.action === "edit" ? props.modelData.id : null,
        projectId: props.projectId,
        modelName:
          props.action === "edit"
            ? props.modelData.modelName
            : values.modelName,
        matchPattern: values.matchPattern,
        pricingTiers: toPricingTierInputs(values),
        tokenizerId: values.tokenizerId,
        tokenizerConfig:
          values.tokenizerConfig &&
          typeof JSON.parse(values.tokenizerConfig) === "object"
            ? (JSON.parse(values.tokenizerConfig) as Record<string, number>)
            : undefined,
      });

      utils.models.invalidate();
      showSuccessToast({
        title: `Model ${props.action === "edit" ? "updated" : "created"}`,
        description: `The model '${upsertedModel.modelName}' has been successfully ${props.action === "edit" ? "updated" : "created"}. New generations will use these model prices.`,
      });

      // Editing is a checkpoint, not an exit: keep the dialog and its context.
      if (props.action === "edit") {
        const live = form.getValues();
        form.reset(submitted); // what we saved is the new clean baseline
        if (!isEqual(live, submitted)) {
          // Typed while the save was in flight: still the user's unsaved work.
          form.reset(live, { keepDefaultValues: true });
        }
        return;
      }

      setOpen(false);
      router.push(
        `/project/${props.projectId}/settings/models/${upsertedModel.id}`,
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  };

  const requestClose = () => {
    if (form.formState.isDirty && !window.confirm(DISCARD_CHANGES_MESSAGE)) {
      return;
    }
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) {
          requestClose();
          return;
        }
        // Reopening starts from the model's current data, not the last edit.
        form.reset(buildFormValues(props));
        setFormError(null);
        setOpen(true);
      }}
    >
      <DialogTrigger
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
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {props.action === "create"
              ? "Create Model"
              : props.action === "clone"
                ? "Clone Model"
                : "Edit Model"}
          </DialogTitle>
          {props.action === "edit" && (
            <DialogDescription>{props.modelData.modelName}</DialogDescription>
          )}
          {props.action === "create" && (
            <DialogDescription>
              Create a new model configuration to track generation costs.
            </DialogDescription>
          )}
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <DialogBody className="space-y-6">
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
                      <Input
                        {...field}
                        onChange={(e) => {
                          const previousName = form.getValues("modelName");
                          const nextName = e.target.value;
                          field.onChange(e);

                          // Follow the name only while the pattern is still the
                          // one we generated — a hand-written or cloned pattern
                          // is the user's, and typing a name must not touch it.
                          const pattern = form.getValues("matchPattern");
                          if (
                            !pattern ||
                            pattern === matchPatternFor(previousName)
                          ) {
                            form.setValue(
                              "matchPattern",
                              nextName ? matchPatternFor(nextName) : "",
                            );
                          }
                        }}
                      />
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
                      generations (model attribute) to this model definition.
                      For an exact, case-insensitive match to a model name, use
                      the expression: (?i)^(modelname)$
                    </FormDescription>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <PricingSection form={form} />

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
                      Optionally, Langfuse can tokenize the input and output of
                      a generation if no unit counts are ingested. This is
                      useful for e.g. streamed OpenAI completions. For details
                      on the supported tokenizers, see the{" "}
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
                      />
                      <FormDescription>
                        The config for the tokenizer. Required for openai. See
                        the{" "}
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
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose}>
                Cancel
              </Button>

              <Button type="submit" loading={upsertModelMutation.isPending}>
                {props.action === "edit" ? "Save" : "Submit"}
              </Button>
            </DialogFooter>
          </form>
          {formError ? (
            <p className="text-destructive my-2 text-center text-sm font-bold">
              <span className="font-bold">Error:</span> {formError}
            </p>
          ) : null}
        </Form>
      </DialogContent>
    </Dialog>
  );
}) as React.FC<UpsertModelDialogProps>;
