/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
/* eslint @repo/no-style-props: "off" */
import cloneDeep from "lodash/cloneDeep";
import isEqual from "lodash/isEqual";
import { useImperativeHandle, useState, type Ref } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/src/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  buildFormValues,
  type ModelFormSource,
} from "@/src/features/models/fns/buildFormValues";
import { matchPatternFor } from "@/src/features/models/fns/matchPatternFor";
import {
  type FormUpsertModel,
  FormUpsertModelSchema,
} from "@/src/features/models/validation";
import { PricingSection } from "@/src/features/models/components/PricingSection/PricingSection";

const DISCARD_CHANGES_MESSAGE =
  "Discard your unsaved changes to this model definition?";

/**
 * The model form without its data source: the caller saves the values and
 * decides where a created model leads. Editing keeps the dialog open.
 */
export function ModelFormDialogContent({
  source,
  title,
  description,
  isSubmitting,
  onSubmit,
  onCreated,
  onCancel,
  closeGuardRef,
}: {
  source: ModelFormSource;
  title: string;
  description?: string;
  isSubmitting: boolean;
  onSubmit: (values: FormUpsertModel) => Promise<{ id: string }>;
  onCreated: (modelId: string) => void;
  onCancel: () => void;
  closeGuardRef?: Ref<() => boolean>;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(FormUpsertModelSchema),
    defaultValues: buildFormValues(source),
  });
  useImperativeHandle(
    closeGuardRef,
    () => () =>
      !form.formState.isDirty || window.confirm(DISCARD_CHANGES_MESSAGE),
  );

  const handleSubmit = async (values: FormUpsertModel) => {
    setFormError(null);
    // Snapshot before the await: nothing typed while the save is in flight may
    // become part of the saved baseline, or the dirty guard would let it go.
    // getValues() copies only the top level, so the clone is load-bearing.
    const submitted = cloneDeep(form.getValues());

    try {
      const saved = await onSubmit(values);

      // Editing is a checkpoint, not an exit: keep the dialog and its context.
      if (source.action === "edit") {
        const live = form.getValues();
        form.reset(submitted); // what we saved is the new clean baseline
        if (!isEqual(live, submitted)) {
          // Typed while the save was in flight: still the user's unsaved work.
          form.reset(live, { keepDefaultValues: true });
        }
        return;
      }

      form.reset(submitted);
      onCreated(saved.id);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <DialogContent size="lg">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description ? (
          <DialogDescription>{description}</DialogDescription>
        ) : null}
      </DialogHeader>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <DialogBody className="space-y-6">
            <FormField
              control={form.control}
              name="modelName"
              disabled={source.action === "edit"}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model Name</FormLabel>
                  <FormDescription>
                    Shown on matched generations and used to reference the model
                    in the API. The match pattern, not the name, decides which
                    model applies. Keep the name and match pattern to track
                    price changes.
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
                    Regular expression (Postgres syntax) matched against the
                    model name of ingested generations. If several models match,
                    project models win over organization models, then Langfuse
                    defaults. For an exact, case-insensitive match, use
                    (?i)^(modelname)$
                  </FormDescription>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <PricingSection form={form} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>

            <Button type="submit" loading={isSubmitting}>
              {source.action === "edit" ? "Save" : "Submit"}
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
  );
}
