import { useCallback, useEffect, useState } from "react";
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
  const initialState = {
    context,
    selection: hasCustomization
      ? ({ type: "draft", configuration: initialConfiguration } as const)
      : ({ type: "messages" } as const),
    draft: null,
    restored: false,
  };
  const [storedState, setState] = useState<{
    context: string;
    selection: Selection;
    draft: Configuration | null;
    restored: boolean;
  }>(initialState);
  const state = storedState.context === context ? storedState : initialState;
  if (storedState.context !== context) setState(initialState);

  const selection = state.selection;
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
      setState({ context, selection, draft: retainedDraft, restored: true });
      persist(selection, configuration);
    },
    [context, persist],
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
    const view = savedViews.data?.find(
      (view) => view.id === id && view.isSupported,
    );
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
        view.id === remembered[storageKey] &&
        view.isSupported &&
        pinnedIds.includes(view.id),
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
              (view) =>
                view.isSupported &&
                pinnedIds.includes(view.id) &&
                matches(view),
            );
      setState({
        context,
        selection: matchingView
          ? { type: "saved", viewId: matchingView.id }
          : { type: "draft", configuration: initialConfiguration },
        draft: null,
        restored: true,
      });
      return;
    }
    if (remembered[storageKey] === "") {
      transition({ type: "none" }, messagesConfiguration, null);
      return;
    }
    const firstPinned = savedViews.data.find(
      (view) => view.isSupported && pinnedIds.includes(view.id),
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
    initialConfiguration,
    context,
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
    customize: (configuration: Configuration) =>
      transition({ type: "draft", configuration }, configuration, null),
    selectSaved: (view: Configuration & { id: string }) =>
      transition({ type: "saved", viewId: view.id }, view, draft),
    saveDraft: (view: Configuration & { id: string }) =>
      transition({ type: "saved", viewId: view.id }, view, null),
    removeDraft: () => {
      if (state.selection.type === "draft") {
        const nextId = pinnedIds.find(
          (id) =>
            id === "messages" ||
            savedViews.data?.some((view) => view.id === id && view.isSupported),
        );
        const view = savedViews.data?.find((view) => view.id === nextId);
        if (view) transition({ type: "saved", viewId: view.id }, view, null);
        else
          transition(
            nextId === "messages" ? { type: "messages" } : { type: "none" },
            messagesConfiguration,
            null,
          );
      } else setState({ ...state, draft: null });
    },
  };
}
