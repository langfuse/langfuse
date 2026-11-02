import useLocalStorage from "@/src/components/useLocalStorage";
import {
  JSON_VIEW_PREFERENCE_STORAGE_KEY,
  type JsonViewPreference,
  jsonViewToggleTab,
  normalizeJsonViewPreference,
} from "@/src/components/ui/jsonViewPreference";

/**
 * Hook for managing JSON Beta toggle state alongside view preference.
 * Used by components that manage view state via localStorage directly
 * (TracePreview, ObservationPreview, ViewModeToggle).
 *
 * For context-based components (TraceDetailView, ObservationDetailView),
 * use useViewPreferences() instead.
 */
export function useJsonBetaToggle(
  currentView: JsonViewPreference,
  setCurrentView: (view: JsonViewPreference) => void,
) {
  // Migration: default to true if user had json-beta selected previously
  // TODO: Remove migration logic after 2025-01-26 (2 weeks) when user settings are migrated
  const [jsonBetaEnabled, setJsonBetaEnabled] = useLocalStorage<boolean>(
    "jsonBetaEnabled",
    typeof window !== "undefined" &&
      localStorage.getItem(JSON_VIEW_PREFERENCE_STORAGE_KEY) === '"json-beta"',
  );

  const selectedViewTab = jsonViewToggleTab(currentView);

  const handleViewTabChange = (tab: string) => {
    if (tab === "json") {
      // When switching to JSON, use beta preference
      setCurrentView(jsonBetaEnabled ? "json-beta" : "json");
      return;
    }
    setCurrentView(normalizeJsonViewPreference(tab));
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
