import * as React from "react";
import { useShallow } from "zustand/react/shallow";
import {
  QueryInput,
  useQueryInputController,
  type QueryCompletionPlan,
} from "@/src/components/design-system/QueryInput/QueryInput";
import {
  useSearchBarStore,
  useSearchBarStoreApi,
  useSearchBarCommit,
} from "../../store/SearchBarStoreProvider";
import { draftsSemanticallyEqual } from "../../store/searchBarStore";
import { deriveQueryTokens } from "../../lib/fns/deriveQueryTokens";
import { EVENTS_FIELD_REGISTRY, type FieldRegistry } from "../../lib/fields";
import { getRecentSearches } from "../../lib/recent-searches";
import {
  scoreTypeContextFromObserved,
  type ObservedOptions,
} from "../../lib/observed-options";
import {
  applyPick,
  planInputCompletions,
  type CompletionOption,
  type QueryPresetSection,
} from "../../lib/completions";
import {
  SCORE_LEVEL_COLORS,
  SCORE_LEVEL_DESCRIPTIONS,
  SCORE_LEVEL_LABELS,
} from "@/src/components/ScoreTag";
import { composerPlaceholder } from "../presentation";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { FilterValuesPopover } from "./FilterValuesPopover";
import { PopoverController } from "@/src/components/ui/popover";
import {
  createTokenFacetState,
  type TokenFacetState,
} from "../../lib/fns/tokenFacet";
import { QueryExpressionEditor } from "./QueryExpressionEditor";

type QueryEditorState = { originalDraft: string; initialValue: string };
type ValuePickerState = {
  initialState: TokenFacetState;
  virtualRef: React.RefObject<{ getBoundingClientRect: () => DOMRect }>;
};

const completionIcons = {
  recent: "history",
  preset: "bookmark",
  operator: "syntax",
  pattern: "syntax",
  field: "search",
  value: "search",
} as const satisfies Record<CompletionOption["kind"], string>;

export function SearchComposer({
  inputId,
  projectId,
  observed,
  erroredColumns,
  onActivateAi,
  onRequestColumns,
  onQueryPresetPick,
  presetSections,
  fieldReason,
  freeTextReason,
  registry = EVENTS_FIELD_REGISTRY,
  size = "default",
}: {
  inputId?: string;
  projectId?: string;
  size?: React.ComponentProps<typeof QueryInput>["size"];
  observed: ObservedOptions | undefined;
  erroredColumns?: ReadonlySet<string>;
  onActivateAi?: () => void;
  onRequestColumns?: (columns: readonly string[]) => void;
  presetSections?: QueryPresetSection[];
  onQueryPresetPick?: (presetId: string) => void;
  fieldReason?: (field: string) => string | null;
  freeTextReason?: string | null;
  registry?: FieldRegistry;
}) {
  const store = useSearchBarStoreApi();
  const commit = useSearchBarCommit();
  const { draft, valid, diagnostics, invalidRevealDraft } = useSearchBarStore(
    useShallow((state) => ({
      draft: state.draft,
      valid: state.draftValid,
      diagnostics: state.draftDiagnostics,
      invalidRevealDraft: state.invalidRevealDraft,
    })),
  );
  const scoreTypes = React.useMemo(
    () => scoreTypeContextFromObserved(observed),
    [observed],
  );
  const showDiagnostics = !valid && invalidRevealDraft === draft;
  const tokens = deriveQueryTokens({
    draft,
    scoreTypes,
    registry,
    showDiagnostics,
    fieldReason,
    freeTextReason,
  });

  const controller = useQueryInputController();
  const [valuePicker, setValuePicker] = React.useState<ValuePickerState | null>(
    null,
  );
  const valuePickerFocusRef = React.useRef<HTMLElement | null>(null);
  const restoreValuePickerFocusRef = React.useRef(false);
  const { autocompleteOpen, selectionSnapshot } = controller;
  const { start, end } = selectionSnapshot;
  const plan = React.useMemo(() => {
    if (!autocompleteOpen || start !== end) return null;
    return planInputCompletions(
      {
        input: draft,
        caret: Math.min(end, draft.length),
        observed,
        erroredColumns,
        recents:
          projectId && draft.trim().length === 0
            ? getRecentSearches(projectId)
            : [],
        presetSections,
        currentQueryText: draft,
      },
      registry,
    );
  }, [
    autocompleteOpen,
    start,
    end,
    draft,
    observed,
    erroredColumns,
    projectId,
    presetSections,
    registry,
  ]);

  // Preserve opaque column names, including commas, across request deduplication.
  const requestColumnsKey = JSON.stringify(plan?.requestColumns ?? []);
  React.useEffect(() => {
    const columns = JSON.parse(requestColumnsKey) as string[];
    if (columns.length === 0) return;
    onRequestColumns?.(columns);
  }, [requestColumnsKey, onRequestColumns]);

  const completions = deriveQueryCompletions({
    plan,
    draft,
    store,
    commit,
    onQueryPresetPick,
  });

  return (
    <DialogController<QueryEditorState>
      renderDialog={({ state, closeDialog }) => {
        const apply = (value: string) => {
          if (
            !draftsSemanticallyEqual(
              store.getState().draft,
              state.originalDraft,
              scoreTypes,
              registry,
            )
          )
            return false;
          store.getState().actions.setDraft(value);
          return commit("pick") !== null;
        };
        return (
          <QueryExpressionEditor
            initialValue={state.initialValue}
            registry={registry}
            scoreTypes={scoreTypes}
            onApply={apply}
            onClose={closeDialog}
          />
        );
      }}
    >
      {({ openDialog }) => (
        <PopoverController
          ariaLabel="Edit filter values"
          align="start"
          contentClassName="w-80 max-w-[calc(100vw-24px)] p-0 py-2"
          disabled={false}
          modal={false}
          onEscapeKeyDown={() => {
            restoreValuePickerFocusRef.current = true;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (restoreValuePickerFocusRef.current) {
              valuePickerFocusRef.current?.focus();
              controller.setAutocompleteOpen(false);
            }
            restoreValuePickerFocusRef.current = false;
          }}
          onOpenChange={(isOpen) => {
            if (!isOpen) setValuePicker(null);
          }}
          renderContent={({ closePopover }) =>
            valuePicker !== null ? (
              <FilterValuesPopover
                initialState={valuePicker.initialState}
                registry={registry}
                scoreTypes={scoreTypes}
                observed={observed}
                erroredColumns={erroredColumns}
                onClose={() => {
                  restoreValuePickerFocusRef.current = true;
                  closePopover();
                }}
                onApply={(previousQuery, nextQuery) => {
                  if (
                    !draftsSemanticallyEqual(
                      store.getState().draft,
                      previousQuery,
                      scoreTypes,
                      registry,
                    )
                  )
                    return false;
                  store.getState().actions.setDraft(nextQuery);
                  return commit("pick") !== null;
                }}
              />
            ) : null
          }
        >
          {({ openPopover, Anchor }) => (
            <>
              {valuePicker !== null ? (
                <Anchor virtualRef={valuePicker.virtualRef} />
              ) : null}
              <QueryInput
                inputId={inputId}
                label="Search"
                size={size}
                value={draft}
                diagnostics={showDiagnostics ? diagnostics : []}
                tokens={tokens}
                placeholder={composerPlaceholder(registry)}
                action={
                  onActivateAi
                    ? {
                        label: "Ask AI",
                        title: "Ask AI to build or refine filters",
                        onClick: onActivateAi,
                      }
                    : undefined
                }
                onValueChange={(value) =>
                  store.getState().actions.setDraft(value)
                }
                onCommit={(value, reason) => {
                  const state = store.getState();
                  if (value !== state.draft) state.actions.setDraft(value);
                  return commit(reason);
                }}
                onRemoveToken={(token) => {
                  store.getState().actions.removeChipSpan(token.from, token.to);
                  if (store.getState().draftValid) commit("pick");
                }}
                areEquivalent={(left, right) =>
                  draftsSemanticallyEqual(left, right, scoreTypes, registry)
                }
                controller={controller}
                completions={completions}
                onEditToken={(token, anchor) => {
                  const initialState = createTokenFacetState(
                    store.getState().draft,
                    token,
                    registry,
                  );
                  if (initialState === null) return;
                  const rect = anchor.getBoundingClientRect();
                  const reference =
                    anchor.closest<HTMLElement>('[role="search"]') ?? anchor;
                  valuePickerFocusRef.current =
                    reference.querySelector<HTMLElement>(
                      '[contenteditable="true"]',
                    ) ?? anchor;
                  restoreValuePickerFocusRef.current = false;
                  const base = reference.getBoundingClientRect();
                  const leftOffset = rect.left - base.left;
                  const topOffset = rect.top - base.top;
                  setValuePicker({
                    initialState,
                    virtualRef: {
                      current: {
                        getBoundingClientRect: () => {
                          if (anchor.isConnected)
                            return anchor.getBoundingClientRect();
                          const current = reference.getBoundingClientRect();
                          return new DOMRect(
                            current.left + leftOffset,
                            current.top + topOffset,
                            rect.width,
                            rect.height,
                          );
                        },
                      },
                    },
                  });
                  const field = registry.resolveField(
                    initialState.template.key,
                  );
                  if (
                    field?.type === "field" &&
                    (field.field.syncMode === "exactOption" ||
                      field.field.syncMode === "arrayOption")
                  ) {
                    onRequestColumns?.([
                      field.field.filterColumn ?? field.field.id,
                    ]);
                  }
                  controller.setAutocompleteOpen(false);
                  openPopover();
                }}
                onExpand={() =>
                  openDialog({
                    originalDraft: store.getState().draft,
                    initialValue: store.getState().draft,
                  })
                }
              />
            </>
          )}
        </PopoverController>
      )}
    </DialogController>
  );
}

function deriveQueryCompletions({
  plan,
  draft,
  store,
  commit,
  onQueryPresetPick,
}: {
  plan: ReturnType<typeof planInputCompletions> | null;
  draft: string;
  store: ReturnType<typeof useSearchBarStoreApi>;
  commit: ReturnType<typeof useSearchBarCommit>;
  onQueryPresetPick?: (presetId: string) => void;
}): QueryCompletionPlan | null {
  if (plan === null) return null;
  const options = plan.sections.flatMap((section) =>
    section.options.map((option) => {
      const completeQuery =
        option.kind === "recent" || option.kind === "preset";
      const edit = (() => {
        if (option.kind === "recent" || option.kind === "preset") {
          const next = option.query.length > 0 ? `${option.query} ` : "";
          return { next, caret: next.length, keepOpen: false };
        }
        return applyPick(option, draft, plan);
      })();
      return {
        id: option.id,
        label: option.label,
        detail: option.kind === "recent" ? undefined : option.detail,
        section: section.title,
        icon: completionIcons[option.kind],
        selected: option.kind === "value" && option.active,
        badges:
          option.kind === "field"
            ? option.scoreLevels?.map((level) => ({
                text: SCORE_LEVEL_LABELS[level],
                color: SCORE_LEVEL_COLORS[level],
                description: SCORE_LEVEL_DESCRIPTIONS[level],
              }))
            : undefined,
        labelColor:
          option.kind === "pattern"
            ? (
                [
                  "pink",
                  "teal",
                  "amber",
                  "orange",
                  "emerald",
                  "yellow",
                  "green",
                  "blue",
                  "purple",
                  "violet",
                ] as const
              ).find((color) =>
                option.textClassName?.includes(`text-${color}-`),
              )
            : undefined,
        edit,
        onApplied: () => {
          const state = store.getState();
          if (completeQuery) {
            if (!state.draftValid) {
              state.actions.revealInvalid();
              return;
            }
            const committed = commit(
              "pick",
              option.kind === "preset" ? { replaceHidden: true } : undefined,
            );
            if (option.kind === "preset" && committed !== null)
              onQueryPresetPick?.(option.id);
            return;
          }
          if (option.kind === "field" && option.fieldId.endsWith(".")) return;
          if (state.draftValid) commit("pick");
        },
      };
    }),
  );
  return {
    options,
    autoHighlight: plan.autoHighlight === true,
    loading: plan.loading,
  };
}
