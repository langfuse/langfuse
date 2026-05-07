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
 * Colors inspired by GitHub's syntax highlighting
 */
const defaultLightTheme: JSONTheme = {
  background: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  keyColor: "#0550ae", // Blue for keys (GitHub property color)
  stringColor: "#0a3069", // Dark blue for strings (GitHub string color)
  numberColor: "#0550ae", // Blue for numbers
  booleanColor: "#0550ae", // Blue for booleans
  nullColor: "hsl(var(--muted-foreground))",
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
 * Colors inspired by GitHub's dark mode syntax highlighting
 */
const defaultDarkTheme: JSONTheme = {
  ...defaultLightTheme,
  keyColor: "#79c0ff", // Light blue for keys (GitHub dark property color)
  stringColor: "#a5d6ff", // Lighter blue for strings (GitHub dark string color)
  numberColor: "#79c0ff", // Light blue for numbers
  booleanColor: "#79c0ff", // Light blue for booleans
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
