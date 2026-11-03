import { useMemo, useSyncExternalStore } from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

// A prompt counts as long when it exceeds the char threshold and would not
// fit a short first-lines preview anyway.
const COLLAPSE_CHAR_THRESHOLD = 250;
const PREVIEW_LINES = 4;
const PREVIEW_CHAR_LIMIT = 500;

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
 * Shared by the section caret on system prompt messages and the trace view
 * preferences (ViewPreferencesContext). Backed by useSyncExternalStore rather than
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
}

interface UseCollapsibleSystemPromptReturn {
  /** True for long system prompts: their section follows the persisted
      preference instead of the default open state. */
  shouldBeCollapsible: boolean;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
}

/**
 * Long system prompts start collapsed by default. Toggling flips the
 * persisted preference, so an explicit "expanded" choice sticks across
 * messages and navigation instead of being force-collapsed.
 */
export function useCollapsibleSystemPrompt({
  isSystemPrompt,
  content,
}: UseCollapsibleSystemPromptOptions): UseCollapsibleSystemPromptReturn {
  const capture = usePostHogClientCapture();
  const [collapsePreference, setCollapsePreference] =
    useCollapseSystemPromptPreference();

  const shouldBeCollapsible = useMemo(() => {
    if (
      !isSystemPrompt ||
      typeof content !== "string" ||
      content.length <= COLLAPSE_CHAR_THRESHOLD
    ) {
      return false;
    }

    // Split only a bounded prefix. A full split("\n") over a multi-MB string
    // is the main-thread cost PrettyJsonView's large-string gate exists to
    // avoid.
    const scanLimit = Math.max(PREVIEW_CHAR_LIMIT, 8_192);
    const scanText =
      content.length > scanLimit ? content.slice(0, scanLimit) : content;
    const lines = scanText.split("\n");
    const previewText = lines.slice(0, PREVIEW_LINES).join("\n");

    return (
      previewText.length > PREVIEW_CHAR_LIMIT ||
      lines.length > PREVIEW_LINES ||
      content.length > scanText.length
    );
  }, [isSystemPrompt, content]);

  const isCollapsed = shouldBeCollapsible && collapsePreference;

  const toggleCollapsed = () => {
    const next = !collapsePreference;
    // No trace analytics dimensions here on purpose: this fires from shared
    // components that also render outside trace contexts (e.g. session view),
    // and the event must keep one shape across sources.
    capture("trace_detail:system_prompt_collapse_toggle", {
      collapsed: next,
      source: "header",
    });
    setCollapsePreference(next);
  };

  return { shouldBeCollapsible, isCollapsed, toggleCollapsed };
}
