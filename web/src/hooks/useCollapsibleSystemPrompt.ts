import { useState, useMemo } from "react";

const COLLAPSE_CHAR_THRESHOLD = 250;
const STORAGE_KEY = "traceSystemPrompt:collapsed";

interface UseCollapsibleSystemPromptOptions {
  role: string;
  content: string;
}

interface UseCollapsibleSystemPromptReturn {
  shouldBeCollapsible: boolean;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  truncatedContent: string;
}

/**
 * Auto-collapses system prompts >250 chars.
 * Saves user preference when manually expanded to localStorage.
 */
export function useCollapsibleSystemPrompt({
  role,
  content,
}: UseCollapsibleSystemPromptOptions): UseCollapsibleSystemPromptReturn {
  const shouldBeCollapsible = useMemo(() => {
    if (role !== "system") return false;
    if (!content || typeof content !== "string") return false;
    return content.length > COLLAPSE_CHAR_THRESHOLD;
  }, [role, content]);

  // Default: collapsed if long
  // Override: expanded if user previously expanded (localStorage = false)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (!shouldBeCollapsible) return false;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // No preference = use default (collapsed)
      // false = user expanded it
      return stored !== null ? JSON.parse(stored) : true;
    } catch {
      return true;
    }
  });

  const toggleCollapsed = () => {
    setIsCollapsed((prev: boolean) => {
      const newValue = !prev;

      try {
        if (newValue) {
          // delete key on collapse to get default behavior
          localStorage.removeItem(STORAGE_KEY);
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(false));
        }
      } catch {
        // Ignore localStorage errors
      }

      return newValue;
    });
  };

  // Truncated preview (first 4 lines or 250 chars)
  const truncatedContent = useMemo(() => {
    if (!shouldBeCollapsible || !content) return content;

    const lines = content.split("\n");
    const preview = lines.slice(0, 4).join("\n");
    const hasMore = lines.length > 4;
    const tooLong = preview.length > COLLAPSE_CHAR_THRESHOLD;

    return tooLong
      ? preview.slice(0, COLLAPSE_CHAR_THRESHOLD) + "..."
      : preview + (hasMore ? "\n..." : "");
  }, [shouldBeCollapsible, content]);

  return {
    shouldBeCollapsible,
    isCollapsed,
    toggleCollapsed,
    truncatedContent,
  };
}
