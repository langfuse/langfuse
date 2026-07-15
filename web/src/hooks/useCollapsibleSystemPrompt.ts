import { useMemo, useSyncExternalStore } from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const COLLAPSE_CHAR_THRESHOLD = 250;
const DEFAULT_PREVIEW_LINES = 4;
// Matches JSONView's collapseStringsAfterLength default; generous enough that
// the first N lines usually survive intact instead of being cut mid-line.
const DEFAULT_PREVIEW_CHAR_LIMIT = 500;

const STORAGE_KEY = "collapseSystemPrompt";
const LEGACY_STORAGE_KEY = "traceSystemPrompt:collapsed";

// Session fallback when localStorage is blocked entirely (sandboxed iframe,
// strict privacy mode): the toggle must still work in-session even if it
// can't persist. Consulted only when reading the stored value throws.
let inMemoryPreference: boolean | null = null;

function readCollapsePreference(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored !== "false";
    // Migration: the legacy key stored `false` when a user explicitly
    // expanded a system prompt. Write the choice through to the new key so
    // it survives removing the legacy fallback; the write happens at most
    // once, since the next read hits the stored-value fast path.
    if (localStorage.getItem(LEGACY_STORAGE_KEY) === "false") {
      localStorage.setItem(STORAGE_KEY, "false");
      return false;
    }
    return true;
  } catch {
    return inMemoryPreference ?? true;
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
  inMemoryPreference = value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // keep going: the in-memory fallback makes the toggle work in-session
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

  // null = collapsing would hide nothing, so no toggle is offered. Deriving
  // collapsibility from the actual truncation result (instead of a bare char
  // threshold) avoids a dead toggle for content that clears the threshold but
  // fits entirely within the preview.
  const preview = useMemo(() => {
    if (
      !isSystemPrompt ||
      typeof content !== "string" ||
      content.length <= COLLAPSE_CHAR_THRESHOLD
    ) {
      return null;
    }

    const lines = content.split("\n");
    const previewText = lines.slice(0, previewLines).join("\n");

    if (previewText.length > previewCharLimit) {
      return previewText.slice(0, previewCharLimit) + "...";
    }
    if (lines.length > previewLines) {
      return previewText + "\n...";
    }
    return null;
  }, [isSystemPrompt, content, previewLines, previewCharLimit]);

  const shouldBeCollapsible = preview !== null;
  const isCollapsed = shouldBeCollapsible && collapsePreference;

  const toggleCollapsed = () => {
    const next = !collapsePreference;
    // No trace analytics dimensions here on purpose: this fires from shared
    // components that also render outside trace contexts (e.g. session view),
    // and the event must keep one shape across sources.
    capture("trace_detail:system_prompt_collapse_toggle", {
      collapsed: next,
      source: "inline",
    });
    setCollapsePreference(next);
  };

  return {
    shouldBeCollapsible,
    isCollapsed,
    toggleCollapsed,
    truncatedContent: preview ?? content,
  };
}
