import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { StringParam, useQueryParams } from "use-query-params";
import {
  assertUnreachable,
  decodeFiltersGeneric,
  encodeFiltersGeneric,
  sessionTraceFilterSchema,
} from "@langfuse/shared";
import { api, type RouterOutputs } from "@/src/utils/api";
import useSessionStorage from "@/src/components/useSessionStorage";
import { useHistoryEntryRevisit } from "../useHistoryEntryRevisit";

type Configuration = Pick<
  RouterOutputs["sessionViews"]["list"][number],
  "filters" | "viewMode" | "unmatchedTraces"
>;

type Selection =
  | { type: "none" }
  | { type: "messages" }
  | { type: "saved"; viewId: string }
  | { type: "draft"; configuration: Configuration };

const messagesConfiguration: Configuration = {
  filters: [],
  viewMode: "conversational",
  unmatchedTraces: "show",
};
const defaultPinnedIds = ["messages"];

export function useSessionViewSelection({
  projectId,
  sessionId,
  enabled,
}: {
  projectId: string;
  sessionId: string;
  enabled: boolean;
}) {
  const userSession = useSession();
  const viewUtils = api.useUtils();
  const [query, setQuery] = useQueryParams({
    traceFilter: StringParam,
    tracesWithoutMatches: StringParam,
    sessionView: StringParam,
  });
  const [remembered, setRemembered] = useSessionStorage<Record<string, string>>(
    "session-selected-views",
    {},
  );
  const storageKey = `${projectId}:${userSession.data?.user?.id ?? "anonymous"}`;
  const context = `${storageKey}:${sessionId}`;
  const isHistoryRevisit = useHistoryEntryRevisit(context);
  const savedViews = api.sessionViews.list.useQuery(
    { projectId },
    { enabled: enabled && userSession.status === "authenticated" },
  );
  const preferences = api.sessionViews.preferences.useQuery(
    { projectId },
    { enabled: enabled && userSession.status === "authenticated" },
  );
  const pinnedIds = preferences.data?.pinnedViewIds ?? defaultPinnedIds;
  const initialConfiguration = (() => {
    let filters: Configuration["filters"] = [];
    try {
      const parsed = sessionTraceFilterSchema.safeParse(
        decodeFiltersGeneric(query.traceFilter ?? ""),
      );
      if (parsed.success) filters = parsed.data;
    } catch {
      // Invalid shared-link filters must not prevent opening the session.
    }
    return {
      filters,
      viewMode: query.sessionView === "list" ? "list" : "conversational",
      unmatchedTraces: query.tracesWithoutMatches === "hide" ? "hide" : "show",
    } satisfies Configuration;
  })();
  const hasCustomization =
    initialConfiguration.filters.length > 0 ||
    initialConfiguration.viewMode === "list" ||
    initialConfiguration.unmatchedTraces === "hide";
  const queryKey = JSON.stringify([
    query.traceFilter,
    query.tracesWithoutMatches,
    query.sessionView,
  ]);
  const initialState = {
    context,
    queryKey,
    selection: hasCustomization
      ? ({ type: "draft", configuration: initialConfiguration } as const)
      : ({ type: "messages" } as const),
    draft: null,
    restored: false,
  };
  const [storedState, setState] = useState<{
    context: string;
    queryKey: string;
    selection: Selection;
    draft: Configuration | null;
    restored: boolean;
  }>(initialState);
  let state = storedState.context === context ? storedState : initialState;
  if (storedState.context !== context) setState(initialState);

  if (state.queryKey !== queryKey) {
    const selection = state.selection;
    const currentConfiguration = (() => {
      if (selection.type === "draft") return selection.configuration;
      if (selection.type === "saved")
        return savedViews.data?.find((view) => view.id === selection.viewId);
      if (selection.type === "messages" || selection.type === "none")
        return messagesConfiguration;
      return assertUnreachable(selection);
    })();
    const matchesSelection =
      currentConfiguration &&
      JSON.stringify(currentConfiguration.filters) ===
        JSON.stringify(initialConfiguration.filters) &&
      currentConfiguration.viewMode === initialConfiguration.viewMode &&
      currentConfiguration.unmatchedTraces ===
        initialConfiguration.unmatchedTraces;
    // Our own URL writes must not discard a retained draft or selected view.
    state = matchesSelection
      ? { ...state, queryKey }
      : {
          ...initialState,
          draft: state.draft,
          restored: !hasCustomization,
        };
    setState(state);
  }

  if (
    state.selection.type === "saved" &&
    savedViews.isSuccess &&
    !savedViews.data?.some(
      (view) =>
        state.selection.type === "saved" && view.id === state.selection.viewId,
    )
  ) {
    const nextId = pinnedIds.find(
      (id) =>
        id === "messages" || savedViews.data?.some((view) => view.id === id),
    );
    const selection: Selection = (() => {
      if (nextId === "messages") return { type: "messages" };
      if (nextId) return { type: "saved", viewId: nextId };
      return { type: "none" };
    })();
    state = { ...state, selection };
    setState(state);
  }

  const selection = state.selection;
  // Pending saves can finish after another draft or page becomes active.
  const completionState = useRef({ state, mounted: true });
  completionState.current.state = state;
  useEffect(() => {
    const current = completionState.current;
    current.mounted = true;
    return () => {
      current.mounted = false;
    };
  }, []);
  const selectedSavedView =
    selection.type === "saved"
      ? savedViews.data?.find((view) => view.id === selection.viewId)
      : undefined;
  const configuration = (() => {
    if (selection.type === "draft") return selection.configuration;
    if (selection.type === "saved")
      return selectedSavedView ?? messagesConfiguration;
    if (selection.type === "messages" || selection.type === "none")
      return messagesConfiguration;
    return assertUnreachable(selection);
  })();
  const draft =
    state.selection.type === "draft"
      ? state.selection.configuration
      : state.draft;
  const selectedId = (() => {
    if (state.selection.type === "saved") return state.selection.viewId;
    if (state.selection.type === "draft") return "unsaved";
    if (state.selection.type === "messages") return "messages";
    if (state.selection.type === "none") return "";
    return assertUnreachable(state.selection);
  })();
  const isCurrentSelection = () => {
    const current = completionState.current;
    return (
      current.mounted &&
      current.state.context === context &&
      current.state.selection === selection &&
      current.state.draft === state.draft
    );
  };

  const persist = useCallback(
    (selection: Selection, configuration: Configuration) => {
      setQuery({
        traceFilter: encodeFiltersGeneric(configuration.filters) || undefined,
        tracesWithoutMatches:
          configuration.unmatchedTraces === "hide" ? "hide" : undefined,
        sessionView: configuration.viewMode === "list" ? "list" : undefined,
      });
      setRemembered((current) => ({
        ...current,
        [storageKey]: (() => {
          if (selection.type === "saved") return selection.viewId;
          if (selection.type === "none") return "";
          if (selection.type === "messages" || selection.type === "draft")
            return "messages";
          return assertUnreachable(selection);
        })(),
      }));
    },
    [setQuery, setRemembered, storageKey],
  );
  const transition = useCallback(
    (
      selection: Selection,
      configuration: Configuration,
      retainedDraft: Configuration | null,
    ) => {
      const next = {
        context,
        queryKey,
        selection,
        draft: retainedDraft,
        restored: true,
      };
      completionState.current.state = next;
      setState(next);
      persist(selection, configuration);
    },
    [context, queryKey, persist],
  );
  const select = (id: string) => {
    if (id === "unsaved") {
      if (draft)
        transition({ type: "draft", configuration: draft }, draft, null);
      return;
    }
    if (id === "" || id === "messages") {
      transition(
        id === "" ? { type: "none" } : { type: "messages" },
        messagesConfiguration,
        draft,
      );
      return;
    }
    const view = savedViews.data?.find((view) => view.id === id);
    if (view) transition({ type: "saved", viewId: id }, view, draft);
  };

  useEffect(() => {
    if (
      !enabled ||
      state.restored ||
      !savedViews.data ||
      !preferences.isSuccess
    )
      return;
    const rememberedView = savedViews.data.find(
      (view) =>
        view.id === remembered[storageKey] && pinnedIds.includes(view.id),
    );
    if (hasCustomization) {
      const matches = (view: Configuration) =>
        JSON.stringify(view.filters) ===
          JSON.stringify(initialConfiguration.filters) &&
        view.viewMode === initialConfiguration.viewMode &&
        view.unmatchedTraces === initialConfiguration.unmatchedTraces;
      const matchingView =
        rememberedView && matches(rememberedView)
          ? rememberedView
          : savedViews.data.find(
              (view) => pinnedIds.includes(view.id) && matches(view),
            );
      setState({
        context,
        queryKey,
        selection: matchingView
          ? { type: "saved", viewId: matchingView.id }
          : { type: "draft", configuration: initialConfiguration },
        draft: null,
        restored: true,
      });
      return;
    }
    if (isHistoryRevisit) {
      setState({
        context,
        queryKey,
        selection: pinnedIds.includes("messages")
          ? { type: "messages" }
          : { type: "none" },
        draft: null,
        restored: true,
      });
      return;
    }
    if (remembered[storageKey] === "") {
      transition({ type: "none" }, messagesConfiguration, null);
      return;
    }
    const firstPinned = savedViews.data.find((view) =>
      pinnedIds.includes(view.id),
    );
    const view = rememberedView ?? firstPinned;
    if (rememberedView || !pinnedIds.includes("messages")) {
      if (view) transition({ type: "saved", viewId: view.id }, view, null);
      else transition({ type: "none" }, messagesConfiguration, null);
      return;
    }
    transition({ type: "messages" }, messagesConfiguration, null);
  }, [
    enabled,
    state.restored,
    savedViews.data,
    preferences.isSuccess,
    remembered,
    storageKey,
    pinnedIds,
    hasCustomization,
    isHistoryRevisit,
    initialConfiguration,
    context,
    queryKey,
    transition,
  ]);

  return {
    savedViews,
    preferences,
    configuration,
    selectedId,
    draft,
    isLoading: state.selection.type === "saved" && !selectedSavedView,
    select,
    selectIfUnchanged: (id: string) => {
      if (isCurrentSelection()) select(id);
    },
    customize: (configuration: Configuration) =>
      transition({ type: "draft", configuration }, configuration, null),
    filterObservationByName: (name: string, operator: "any of" | "none of") => {
      const next: Configuration = {
        ...configuration,
        filters: [
          ...configuration.filters,
          operator === "any of"
            ? { column: "name", type: "string", operator: "=", value: name }
            : {
                column: "name",
                type: "stringOptions",
                operator,
                value: [name],
              },
        ],
      };
      transition({ type: "draft", configuration: next }, next, null);
    },
    selectSaved: (view: RouterOutputs["sessionViews"]["create"]["view"]) => {
      viewUtils.sessionViews.list.setData({ projectId }, (current) => {
        const existing = current?.find((savedView) => savedView.id === view.id);
        const updated = {
          createdByUser: null,
          canEdit: true,
          ...existing,
          ...view,
        };
        if (existing)
          return current?.map((savedView) =>
            savedView.id === view.id ? updated : savedView,
          );
        return [...(current ?? []), updated];
      });
      if (isCurrentSelection())
        transition({ type: "saved", viewId: view.id }, view, draft);
    },
    saveDraft: (
      view: Configuration & { id: string },
      submittedDraft: Configuration | null = draft,
    ) => {
      const current = completionState.current;
      if (
        !current.mounted ||
        current.state.context !== context ||
        !submittedDraft
      )
        return;
      const currentSelection = current.state.selection;
      const currentDraft =
        currentSelection.type === "draft"
          ? currentSelection.configuration
          : current.state.draft;
      if (currentDraft !== submittedDraft) return;
      const next = { ...current.state, draft: null };
      if (currentSelection.type === "draft") {
        next.selection = { type: "saved", viewId: view.id };
        persist(next.selection, view);
      }
      current.state = next;
      setState(next);
    },
    removeDraft: () => {
      if (state.selection.type === "draft") {
        const nextId = pinnedIds.find(
          (id) =>
            id === "messages" ||
            savedViews.data?.some((view) => view.id === id),
        );
        const view = savedViews.data?.find((view) => view.id === nextId);
        if (view) transition({ type: "saved", viewId: view.id }, view, null);
        else
          transition(
            nextId === "messages" ? { type: "messages" } : { type: "none" },
            messagesConfiguration,
            null,
          );
      } else {
        const next = { ...state, draft: null };
        completionState.current.state = next;
        setState(next);
      }
    },
  };
}
