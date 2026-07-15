import { useMemo, useSyncExternalStore } from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const COLLAPSE_CHAR_THRESHOLD = 250;
const DEFAULT_PREVIEW_LINES = 4;
// Matches JSONView's collapseStringsAfterLength default; generous enough that
// the first N lines usually survive intact instead of being cut mid-line.
const DEFAULT_PREVIEW_CHAR_LIMIT = 500;

const STORAGE_KEY = "collapseSystemPrompt";
const LEGACY_STORAGE_KEY = "traceSystemPrompt:collapsed";

function readCollapsePreference(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored !== "false";
    // Migration: the legacy key stored `false` when a user explicitly
    // expanded a system prompt; keep respecting that choice.
    return localStorage.getItem(LEGACY_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function subscribeToCollapsePreference(onChange: () => void): () => void {
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  const handleCustomEvent = (e: Event) => {
    if ((e as CustomEvent<{ key: string }>).detail?.key === STORAGE_KEY)
      onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener("localStorageChange", handleCustomEvent);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("localStorageChange", handleCustomEvent);
  };
}

function writeCollapsePreference(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore localStorage errors
  }
  // Same event contract as useLocalStorage, so all subscribers (every mounted
  // system prompt plus ViewPreferencesContext) update in the same tab.
  window.dispatchEvent(
    new CustomEvent("localStorageChange", {
      detail: { key: STORAGE_KEY, newValue: JSON.stringify(value) },
    }),
  );
}

/**
 * Persisted default for whether long system prompts render collapsed.
 * Shared by the inline expand/collapse toggle and the trace view preferences
 * (ViewPreferencesContext). Backed by useSyncExternalStore rather than
 * per-instance state: many instances of this hook mount at once (one per
 * message), and a state-updater-based sync would setState across components
 * mid-render.
 */
export function useCollapseSystemPromptPreference(): [
  boolean,
  (value: boolean) => void,
] {
  const value = useSyncExternalStore(
    subscribeToCollapsePreference,
    readCollapsePreference,
    () => true,
  );
  return [value, writeCollapsePreference];
}

interface UseCollapsibleSystemPromptOptions {
  /** Decide from the raw message role, not the display title — a system
      message that carries a `name` is titled by that name. */
  isSystemPrompt: boolean;
  content: string;
  /** Number of lines shown while collapsed. */
  previewLines?: number;
  /** Character cap applied to the collapsed preview. */
  previewCharLimit?: number;
}

interface UseCollapsibleSystemPromptReturn {
  shouldBeCollapsible: boolean;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  truncatedContent: string;
}

/**
 * Collapses long system prompts to a first-N-lines preview by default.
 * Toggling flips the persisted preference, so an explicit "expanded" choice
 * sticks across messages and navigation instead of being force-collapsed.
 */
export function useCollapsibleSystemPrompt({
  isSystemPrompt,
  content,
  previewLines = DEFAULT_PREVIEW_LINES,
  previewCharLimit = DEFAULT_PREVIEW_CHAR_LIMIT,
}: UseCollapsibleSystemPromptOptions): UseCollapsibleSystemPromptReturn {
  const capture = usePostHogClientCapture();
  const [collapsePreference, setCollapsePreference] =
    useCollapseSystemPromptPreference();

  const shouldBeCollapsible =
    isSystemPrompt &&
    typeof content === "string" &&
    content.length > COLLAPSE_CHAR_THRESHOLD;

  const isCollapsed = shouldBeCollapsible && collapsePreference;

  const toggleCollapsed = () => {
    const next = !collapsePreference;
    capture("trace_detail:system_prompt_collapse_toggle", {
      collapsed: next,
      source: "inline",
    });
    setCollapsePreference(next);
  };

  const truncatedContent = useMemo(() => {
    if (!shouldBeCollapsible || !content) return content;

    const lines = content.split("\n");
    const preview = lines.slice(0, previewLines).join("\n");
    const hasMore = lines.length > previewLines;

    return preview.length > previewCharLimit
      ? preview.slice(0, previewCharLimit) + "..."
      : preview + (hasMore ? "\n..." : "");
  }, [shouldBeCollapsible, content, previewLines, previewCharLimit]);

  return {
    shouldBeCollapsible,
    isCollapsed,
    toggleCollapsed,
    truncatedContent,
  };
}
