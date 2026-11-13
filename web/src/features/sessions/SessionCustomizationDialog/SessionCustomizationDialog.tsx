import { type ComponentProps, useId } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { type FilterState } from "@langfuse/shared";
import { type RouterOutputs } from "@/src/utils/api";
import { ListTree, Sparkles } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { Form } from "@/src/components/design-system/Form/Form";
import { Input } from "@/src/components/design-system/Input/Input";
import { RadioCardGroup } from "@/src/components/design-system/RadioCardGroup/RadioCardGroup";
import {
  SessionFilterInput,
  useSessionFilterInput,
} from "./components/SessionFilterInput/SessionFilterInput";
import { SessionFilterPreview } from "./components/SessionFilterPreview/SessionFilterPreview";
import { useSessionFilterPreview } from "./useSessionFilterPreview";

type SessionViewMode = "conversational" | "list";

function hasPreset(filters: FilterState, preset: FilterState[number]) {
  return filters.some(
    (existing) =>
      existing.column === preset.column &&
      existing.type === preset.type &&
      existing.operator === preset.operator &&
      existing.value === preset.value,
  );
}

export function SessionCustomizationDialog({
  projectId,
  initialFilters,
  initialUnmatchedTraces,
  initialViewMode,
  onApply,
  preview,
  variant,
}: {
  projectId: string;
  variant:
    | { type: "customize" }
    | {
        type: "edit";
        initialName: string;
        pending: boolean;
        disabled: boolean;
        error?: string;
      };
  initialFilters: FilterState;
  initialUnmatchedTraces: "show" | "hide";
  initialViewMode: SessionViewMode;
  onApply: (values: {
    name: string;
    filters: FilterState;
    unmatchedTraces: "show" | "hide";
    viewMode: SessionViewMode;
  }) => void;
  preview: Pick<
    ComponentProps<typeof SessionFilterPreview>,
    "pending" | "error"
  > & { traces: RouterOutputs["sessions"]["previewTree"] | undefined };
}) {
  const editing = variant.type === "edit" ? variant : undefined;
  const formId = useId();
  const form = useForm({
    defaultValues: {
      name: editing?.initialName ?? "",
      filters: initialFilters,
      unmatchedTraces: initialUnmatchedTraces,
      viewMode: initialViewMode,
    },
    mode: "onChange",
  });
  const draft = useWatch({ control: form.control, name: "filters" });
  const filterInput = useSessionFilterInput({
    projectId,
    filters: draft,
    onFiltersChange: (filters) => form.setValue("filters", filters),
  });
  const matchingTraces = useSessionFilterPreview(
    preview.traces,
    filterInput.filters,
  );
  const handlePresetToggle = (filter: FilterState[number]) => {
    const filters = filterInput.readFilters();
    if (filters === null) return;
    const present = hasPreset(filters, filter);
    const remaining = filters.filter(
      (existing) =>
        existing.column !== filter.column ||
        existing.operator !== filter.operator,
    );
    filterInput.applyFilters(present ? remaining : [...remaining, filter]);
  };
  const handlePreviewFilter = (filter: FilterState[number]) => {
    const filters = filterInput.readFilters();
    if (filters === null) return;
    if (
      filters.some(
        (existing) => JSON.stringify(existing) === JSON.stringify(filter),
      )
    )
      return;
    filterInput.applyFilters([...filters, filter]);
  };
  const handleSubmit = (
    values: Parameters<typeof onApply>[0],
    confirm: (values: Parameters<typeof onApply>[0]) => void,
  ) => {
    const filters = filterInput.readFilters();
    if (filters === null) return;
    const configuration = { ...values, filters };
    if (
      !preview.pending &&
      !preview.error &&
      matchingTraces?.some((trace) => trace.observations.length > 0) &&
      !matchingTraces.some((trace) =>
        trace.observations.some((observation) => observation.matches),
      )
    ) {
      confirm(configuration);
      return;
    }
    onApply(configuration);
  };

  return (
    <Dialog
      size="lg"
      title={editing ? "Edit view" : "Customize session view"}
      actions={[
        {
          label: editing ? "Save changes" : "Apply changes",
          type: "submit",
          form: formId,
          loading: editing?.pending,
          disabled:
            filterInput.invalid ||
            (editing ? editing.disabled || !form.formState.isValid : false),
        },
      ]}
    >
      <ConfirmationDialogController<Parameters<typeof onApply>[0]>
        title="Apply filters with no matching observations?"
        text="These filters exclude every observation in the preview. Applying them may make it appear that session data is missing."
        confirmLabel="Apply filters anyway"
        variant="default"
        onConfirm={onApply}
      >
        {({ openDialog }) => (
          <form
            id={formId}
            className="flex min-h-0 flex-1 flex-col overflow-hidden border-y text-sm sm:h-[65vh] sm:flex-initial"
            onSubmit={form.handleSubmit((values) =>
              handleSubmit(values, openDialog),
            )}
          >
            <div className="grid min-h-0 min-w-0 flex-1 overflow-y-auto md:grid-cols-2 md:grid-rows-[minmax(0,1fr)] md:overflow-hidden">
              <div className="flex flex-col gap-2 p-4 md:overflow-y-auto">
                {editing && (
                  <div className="mb-2 border-b pb-4">
                    <Form.Field label="View name">
                      {({ id }) => (
                        <Input
                          id={id}
                          {...form.register("name", {
                            setValueAs: (value: string) => value.trim(),
                            required: true,
                          })}
                          autoFocus
                        />
                      )}
                    </Form.Field>
                  </div>
                )}
                {editing?.error && (
                  <p role="alert" className="text-destructive text-sm">
                    {editing.error}
                  </p>
                )}
                <Form.Field label="Observation filters">
                  {({ id }) => (
                    <SessionFilterInput
                      {...filterInput.inputProps}
                      inputId={id}
                    />
                  )}
                </Form.Field>
                <p className="text-muted-foreground text-xs font-bold">
                  Presets
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      {
                        label: "Root spans",
                        icon: ListTree,
                        filter: {
                          column: "isRootObservation",
                          type: "boolean",
                          operator: "=",
                          value: true,
                        },
                      },
                      {
                        label: "Generations",
                        icon: Sparkles,
                        filter: {
                          column: "type",
                          type: "string",
                          operator: "=",
                          value: "GENERATION",
                        },
                      },
                    ] satisfies Array<{
                      label: string;
                      icon: typeof ListTree;
                      filter: FilterState[number];
                    }>
                  ).map(({ label, icon: Icon, filter }) => (
                    <Button
                      key={label}
                      text={label}
                      icon={Icon}
                      variant="outline"
                      aria-pressed={hasPreset(filterInput.filters, filter)}
                      disabled={filterInput.invalid}
                      onClick={() => handlePresetToggle(filter)}
                    />
                  ))}
                </div>
                <p className="text-muted-foreground text-sm">
                  Adding filters{" "}
                  <strong className="font-bold underline underline-offset-2">
                    disables automatic message deduplication
                  </strong>{" "}
                  in the session view. Only your filters then determine which
                  data appears in the session view.
                </p>
                <div className="mt-2 border-t pt-4">
                  <Form.Field
                    label="View"
                    description="Conversational groups messages into a conversation and hides repeated messages. List shows observations chronologically with their recorded input and output."
                  >
                    {({ id }) => (
                      <Controller
                        control={form.control}
                        name="viewMode"
                        render={({ field }) => (
                          <RadioCardGroup<SessionViewMode>
                            id={id}
                            aria-label="View"
                            value={field.value}
                            onValueChange={field.onChange}
                            options={[
                              {
                                value: "conversational",
                                label: "Conversational",
                              },
                              { value: "list", label: "List" },
                            ]}
                          />
                        )}
                      />
                    )}
                  </Form.Field>
                </div>
                <div className="mt-2 border-t pt-4">
                  <Form.Field
                    label="Traces without matching observations"
                    description="Hiding removes traces left empty by observation filters, which may make data appear missing. Trace name filters always apply."
                  >
                    {({ id, inputDescribedById }) => (
                      <Controller
                        control={form.control}
                        name="unmatchedTraces"
                        render={({ field }) => (
                          <RadioCardGroup<"show" | "hide">
                            id={id}
                            aria-label="Traces without matching observations"
                            aria-describedby={inputDescribedById}
                            value={field.value}
                            onValueChange={field.onChange}
                            options={[
                              { value: "show", label: "Show" },
                              { value: "hide", label: "Hide" },
                            ]}
                          />
                        )}
                      />
                    )}
                  </Form.Field>
                </div>
              </div>
              <SessionFilterPreview
                {...preview}
                traces={matchingTraces}
                invalid={filterInput.invalid}
                onFilter={handlePreviewFilter}
              />
            </div>
          </form>
        )}
      </ConfirmationDialogController>
    </Dialog>
  );
}
