/**
 * useJsonTheme - Theme resolution hook
 *
 * Resolves theme configuration by merging user overrides with defaults.
 * Supports light/dark mode detection.
 */

import { useMemo } from "react";
import { useTheme } from "next-themes";
import { type JSONTheme, type PartialJSONTheme } from "../types";

/**
 * Default light theme
 * Value colors are the `--json-value-*` tokens, so light and dark resolve in CSS.
 */
const defaultLightTheme: JSONTheme = {
  background: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  keyColor: "hsl(var(--muted-foreground))",
  stringColor: "var(--json-value-string)",
  numberColor: "var(--json-value-number)",
  booleanColor: "var(--json-value-boolean)",
  nullColor: "var(--json-value-nullish)",
  punctuationColor: "hsl(var(--muted-foreground))",
  lineNumberColor: "hsl(var(--muted-foreground))",
  expandButtonColor: "hsl(var(--muted-foreground))",
  copyButtonColor: "hsl(var(--muted-foreground))",
  hoverBackground: "hsl(var(--accent))",
  selectedBackground: "hsl(var(--accent))",
  searchMatchBackground: "rgba(255, 255, 0, 0.25)", // Yellow highlight
  searchCurrentBackground: "rgba(255, 255, 0, 0.4)", // Brighter yellow
  fontSize: "0.75rem",
  lineHeight: 24,
  indentSize: 12,
};

/**
 * Default dark theme
 */
const defaultDarkTheme: JSONTheme = {
  ...defaultLightTheme,
  searchMatchBackground: "rgba(255, 255, 0, 0.2)",
  searchCurrentBackground: "rgba(255, 255, 0, 0.35)",
};

/**
 * Hook to get resolved theme with user overrides
 */
export function useJsonTheme(userTheme?: PartialJSONTheme): JSONTheme {
  const { resolvedTheme } = useTheme();

  return useMemo(() => {
    // Select base theme based on mode
    const baseTheme =
      resolvedTheme === "dark" ? defaultDarkTheme : defaultLightTheme;

    // Merge with user overrides
    if (!userTheme) return baseTheme;

    return {
      ...baseTheme,
      ...userTheme,
    };
  }, [resolvedTheme, userTheme]);
}
