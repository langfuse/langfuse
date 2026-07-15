import { useMemo } from "react";
import useLocalStorage from "@/src/components/useLocalStorage";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const COLLAPSE_CHAR_THRESHOLD = 250;
const DEFAULT_PREVIEW_LINES = 4;
const DEFAULT_PREVIEW_CHAR_LIMIT = 250;

const STORAGE_KEY = "collapseSystemPrompt";
const LEGACY_STORAGE_KEY = "traceSystemPrompt:collapsed";

function getInitialCollapsePreference(): boolean {
  if (typeof window === "undefined") return true;
  // Migration: the legacy key stored `false` when a user explicitly expanded
  // a system prompt; keep respecting that choice under the new key.
  return localStorage.getItem(LEGACY_STORAGE_KEY) !== "false";
}

/**
 * Persisted default for whether long system prompts render collapsed.
 * Shared by the inline expand/collapse toggle and the trace view preferences
 * (ViewPreferencesContext); all instances stay in sync via useLocalStorage's
 * localStorageChange events.
 */
export function useCollapseSystemPromptPreference() {
  return useLocalStorage<boolean>(STORAGE_KEY, getInitialCollapsePreference());
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
