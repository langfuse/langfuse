import useLocalStorage from "@/src/components/useLocalStorage";

type ViewMode = "pretty" | "json" | "json-beta";

/**
 * Hook for managing JSON Beta toggle state alongside view preference.
 * Used by components that manage view state via localStorage directly
 * (TracePreview, ObservationPreview, ViewModeToggle).
 *
 * For context-based components (TraceDetailView, ObservationDetailView),
 * use useViewPreferences() instead.
 */
export function useJsonBetaToggle(
  currentView: ViewMode,
  setCurrentView: (view: ViewMode) => void,
) {
  // Migration: default to true if user had json-beta selected previously
  // TODO: Remove migration logic after 2025-01-26 (2 weeks) when user settings are migrated
  const [jsonBetaEnabled, setJsonBetaEnabled] = useLocalStorage<boolean>(
    "jsonBetaEnabled",
    typeof window !== "undefined" &&
      localStorage.getItem("jsonViewPreference") === '"json-beta"',
  );

  // Derive UI tab selection (2 tabs: pretty or json)
  const selectedViewTab =
    currentView === "pretty" ? ("pretty" as const) : ("json" as const);

  const handleViewTabChange = (tab: string) => {
    if (tab === "pretty") {
      setCurrentView("pretty");
    } else {
      // When switching to JSON, use beta preference
      setCurrentView(jsonBetaEnabled ? "json-beta" : "json");
    }
  };

  const handleBetaToggle = (enabled: boolean) => {
    setJsonBetaEnabled(enabled);
    setCurrentView(enabled ? "json-beta" : "json");
  };

  return {
    jsonBetaEnabled,
    selectedViewTab,
    handleViewTabChange,
    handleBetaToggle,
  };
}
