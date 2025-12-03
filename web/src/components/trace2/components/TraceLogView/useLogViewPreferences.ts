/**
 * Hook for persisting LogView display preferences to localStorage.
 *
 * Preferences:
 * - indentEnabled: Show tree depth via visual indentation
 * - showMilliseconds: Display milliseconds in time values
 */

import useLocalStorage from "@/src/components/useLocalStorage";

export function useLogViewPreferences() {
  const [indentEnabled, setIndentEnabled] = useLocalStorage(
    "logView-indentEnabled",
    false,
  );
  const [showMilliseconds, setShowMilliseconds] = useLocalStorage(
    "logView-showMilliseconds",
    false,
  );

  return {
    indentEnabled,
    setIndentEnabled,
    showMilliseconds,
    setShowMilliseconds,
  };
}
