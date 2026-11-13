import { type ComponentProps, useId } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { type FilterState } from "@langfuse/shared";
import { type RouterOutputs } from "@/src/utils/api";
import { ListTree, Sparkles } from "@langfuse/icons";
import { Button } from "@/src/components/ui/button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { Form } from "@/src/components/design-system/Form/Form";
import { RadioCardGroup } from "@/src/components/design-system/RadioCardGroup/RadioCardGroup";
import {
  SessionFilterInput,
  useSessionFilterInput,
} from "./components/SessionFilterInput/SessionFilterInput";
import { SessionFilterPreview } from "./components/SessionFilterPreview/SessionFilterPreview";
import { useSessionFilterPreview } from "./useSessionFilterPreview";

type SessionViewMode = "conversational" | "list";

export function SessionCustomizationDialog({
  projectId,
  initialFilters,
  initialUnmatchedTraces,
  initialViewMode,
  onApply,
  preview,
}: {
  projectId: string;
  initialFilters: FilterState;
  initialUnmatchedTraces: "show" | "hide";
  initialViewMode: SessionViewMode;
  onApply: (
    filters: FilterState,
    unmatchedTraces: "show" | "hide",
    viewMode: SessionViewMode,
  ) => void;
  preview: Pick<
    ComponentProps<typeof SessionFilterPreview>,
    "pending" | "error"
  > & { traces: RouterOutputs["sessions"]["previewTree"] | undefined };
}) {
  const formId = useId();
  const form = useForm({
    defaultValues: {
      filters: initialFilters,
      unmatchedTraces: initialUnmatchedTraces,
      viewMode: initialViewMode,
    },
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
    const present = filters.some(
      (existing) =>
        existing.column === filter.column &&
        existing.type === filter.type &&
        existing.operator === filter.operator &&
        existing.value === filter.value,
    );
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
    values: {
      unmatchedTraces: Parameters<typeof onApply>[1];
      viewMode: Parameters<typeof onApply>[2];
    },
    confirm: (args: Parameters<typeof onApply>) => void,
  ) => {
    const filters = filterInput.readFilters();
    if (filters === null) return;
    if (
      !preview.pending &&
      !preview.error &&
      matchingTraces?.some((trace) => trace.observations.length > 0) &&
      !matchingTraces.some((trace) =>
        trace.observations.some((observation) => observation.matches),
      )
    ) {
      confirm([filters, values.unmatchedTraces, values.viewMode]);
      return;
    }
    onApply(filters, values.unmatchedTraces, values.viewMode);
  };

  return (
    <Dialog
      size="lg"
      title="Customize session view"
      actions={[{ label: "Apply changes", type: "submit", form: formId }]}
    >
      <ConfirmationDialogController<Parameters<typeof onApply>>
        title="Apply filters with no matching observations?"
        text="These filters exclude every observation in the preview. Applying them may make it appear that session data is missing."
        confirmLabel="Apply filters anyway"
        variant="default"
        onConfirm={([filters, nextUnmatchedTraces, nextViewMode]) =>
          onApply(filters, nextUnmatchedTraces, nextViewMode)
        }
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
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex h-8 items-center gap-2 text-sm"
                      disabled={filterInput.invalid}
                      onClick={() => handlePresetToggle(filter)}
                    >
                      <Icon size="base" />
                      {label}
                    </Button>
                  ))}
                </div>
                <p className="text-muted-foreground text-sm">
                  By default, the session view automatically hides repeated
                  messages. Adding observation filters turns this off, so all
                  matching observations are shown exactly as recorded. Your
                  filters determine which data appears in the session view.
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
