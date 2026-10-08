import {
  type ComponentProps,
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { type FilterState } from "@langfuse/shared";
import { type RouterOutputs } from "@/src/utils/api";
import { ListTree, Sparkles } from "@langfuse/icons";
import { Button } from "@/src/components/ui/button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { Form } from "@/src/components/design-system/Form/Form";
import { RadioCardGroup } from "@/src/components/design-system/RadioCardGroup/RadioCardGroup";
import {
  EventsSearchBarRow,
  planCommit,
  useEventsSearchBar,
} from "@/src/features/search-bar";
import { type ObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { SESSION_TRACE_FIELD_REGISTRY } from "../sessionTraceSearchRegistry";
import { SessionFilterPreview } from "./components/SessionFilterPreview/SessionFilterPreview";

export function SessionCustomizationDialog({
  projectId,
  initialFilters,
  initialUnmatchedTraces,
  observed,
  onApply,
  preview,
}: {
  projectId: string;
  initialFilters: FilterState;
  initialUnmatchedTraces: "show" | "hide";
  observed: ObservedOptions | undefined;
  onApply: (filters: FilterState, unmatchedTraces: "show" | "hide") => void;
  preview: Pick<
    ComponentProps<typeof SessionFilterPreview>,
    "pending" | "error"
  > & { traces: RouterOutputs["sessions"]["previewTree"] | undefined };
}) {
  const formId = useId();
  const [draft, setDraft] = useState(initialFilters);
  const [unmatchedTraces, setUnmatchedTraces] = useState(
    initialUnmatchedTraces,
  );
  const { store, commit, applyFilters } = useEventsSearchBar({
    projectId,
    tableName: "session-traces",
    registry: SESSION_TRACE_FIELD_REGISTRY,
    enabled: true,
    isV4: true,
    filterState: draft,
    setFilterState: setDraft,
    observed,
    searchQuery: null,
    searchType: [],
    setSearchQuery: () => {},
    setSearchType: () => {},
  });
  const query = useSyncExternalStore(
    store.subscribe,
    () => store.getState().draft,
    () => store.getState().draft,
  );
  const previewPlan = useMemo(
    () => planCommit(query, undefined, SESSION_TRACE_FIELD_REGISTRY),
    [query],
  );
  const [lastValidFilters, setLastValidFilters] = useState<FilterState>([]);
  const activeFilters =
    previewPlan.status === "invalid" ? lastValidFilters : previewPlan.filters;
  useEffect(() => {
    if (previewPlan.status !== "invalid")
      setLastValidFilters(previewPlan.filters);
  }, [previewPlan]);
  const matchingTraces = useMemo(
    () =>
      preview.traces?.map((trace) => {
        const observations = trace.observations.map((observation) => ({
          ...observation,
          matches: activeFilters.every((filter) => {
            if (
              filter.column === "isRootObservation" &&
              filter.type === "boolean"
            ) {
              return (observation.isRootObservation === true) === filter.value;
            }
            if (filter.type !== "string") return false;
            const value = (() => {
              if (filter.column === "name") return observation.name;
              if (filter.column === "traceName") return trace.name;
              if (filter.column === "type") return observation.type;
              return observation.level;
            })();
            if (value === null || value === undefined) return false;
            if (filter.operator === "=") return value === filter.value;
            const contains = value.includes(filter.value);
            if (filter.operator === "contains") return contains;
            if (filter.operator === "does not contain") return !contains;
            return false;
          }),
        }));
        return {
          ...trace,
          observations,
          matches:
            activeFilters.length === 0 ||
            observations.some((observation) => observation.matches),
        };
      }),
    [preview.traces, activeFilters],
  );
  const readDraftFilters = () => {
    const result = planCommit(
      store.getState().draft,
      undefined,
      SESSION_TRACE_FIELD_REGISTRY,
    );
    commit();
    if (result.status === "invalid") return null;
    return result.filters;
  };

  return (
    <Dialog
      size="lg"
      title="Customize session view"
      actions={[{ label: "Apply filters", type: "submit", form: formId }]}
    >
      <ConfirmationDialogController<Parameters<typeof onApply>>
        title="Apply filters with no matching observations?"
        text="These filters exclude every observation in the preview. Applying them may make it appear that session data is missing."
        confirmLabel="Apply filters anyway"
        variant="default"
        onConfirm={([filters, nextUnmatchedTraces]) =>
          onApply(filters, nextUnmatchedTraces)
        }
      >
        {({ openDialog }) => (
          <form
            id={formId}
            className="min-h-0 overflow-y-auto border-y text-sm"
            onSubmit={(event) => {
              event.preventDefault();
              const filters = readDraftFilters();
              if (filters === null) return;
              if (
                !preview.pending &&
                !preview.error &&
                matchingTraces?.some(
                  (trace) => trace.observations.length > 0,
                ) &&
                !matchingTraces.some((trace) =>
                  trace.observations.some((observation) => observation.matches),
                )
              ) {
                openDialog([filters, unmatchedTraces]);
                return;
              }
              onApply(filters, unmatchedTraces);
            }}
          >
            <div className="grid min-w-0 md:grid-cols-2">
              <div className="flex flex-col gap-2 p-4">
                <Form.Field label="Observation filters">
                  {({ id }) => (
                    <EventsSearchBarRow
                      inputId={id}
                      spacing="flush"
                      projectId={projectId}
                      tableName="session-traces"
                      registry={SESSION_TRACE_FIELD_REGISTRY}
                      isV4
                      store={store}
                      commit={commit}
                      observed={observed}
                      onApplyFilters={applyFilters}
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
                      disabled={previewPlan.status === "invalid"}
                      onClick={() => {
                        const filters = readDraftFilters();
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
                        applyFilters(
                          present ? remaining : [...remaining, filter],
                        );
                      }}
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
                    label="Traces without matching observations"
                    description="Hiding removes traces left empty by observation filters, which may make data appear missing. Trace name filters always apply."
                  >
                    {({ id, inputDescribedById }) => (
                      <RadioCardGroup<"show" | "hide">
                        id={id}
                        aria-label="Traces without matching observations"
                        aria-describedby={inputDescribedById}
                        value={unmatchedTraces}
                        onValueChange={setUnmatchedTraces}
                        options={[
                          { value: "show", label: "Show" },
                          { value: "hide", label: "Hide" },
                        ]}
                      />
                    )}
                  </Form.Field>
                </div>
              </div>
              <SessionFilterPreview
                {...preview}
                traces={matchingTraces}
                invalid={previewPlan.status === "invalid"}
                onFilter={(filter) => {
                  const filters = readDraftFilters();
                  if (filters === null) return;
                  if (
                    filters.some(
                      (existing) =>
                        JSON.stringify(existing) === JSON.stringify(filter),
                    )
                  )
                    return;
                  applyFilters([...filters, filter]);
                }}
              />
            </div>
          </form>
        )}
      </ConfirmationDialogController>
    </Dialog>
  );
}
