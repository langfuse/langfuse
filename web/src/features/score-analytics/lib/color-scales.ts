/**
 * Color scale utilities for score analytics visualizations
 * - Heatmap: Uses OKLCH color space for perceptually uniform lightness gradients
 * - Charts: Uses CSS variables from globals.css for consistent theming
 * Aligned with dashboard chart colors from global.css
 */

import chroma from "chroma-js";

/**
 * OKLCH base colors from global.css
 * These are used for different charts when comparing multiple scores
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used via typeof
const HEATMAP_BASE_COLORS = {
  chart1: { l: 66.2, c: 0.225, h: 25.9 }, // --color-1 (orange-ish)
  chart2: { l: 60.4, c: 0.26, h: 302 }, // --color-2 (magenta-ish)
  chart3: { l: 69.6, c: 0.165, h: 251 }, // --color-3 (blue-ish)
  chart4: { l: 80.2, c: 0.134, h: 225 }, // --color-4 (light blue-ish)
  chart5: { l: 90.7, c: 0.231, h: 133 }, // --color-5 (green-ish)
  accent: { l: 65, c: 0.1, h: 240 }, // --accent (blue-ish, muted but visible)
} as const;

/**
 * Get contrasting text color (black or white) for an OKLCH background color
 * Uses lightness threshold to determine contrast
 * @param oklchColor - OKLCH color string (e.g., "oklch(66.2% 0.225 25.9)")
 * @returns 'black' or 'white'
 */
export function getContrastColor(oklchColor: string): "black" | "white" {
  // Extract lightness from OKLCH string
  const match = oklchColor.match(/oklch\((\d+\.?\d*)%/);
  const lightness = match ? parseFloat(match[1]) : 50;

  // Threshold at 60% lightness
  return lightness > 60 ? "black" : "white";
}

/**
 * =======================
 * Chart Color Functions
 * =======================
 * These functions provide colors for distribution and time series charts
 */

/**
 * Get the base color for single score charts
 * Uses the brand's dark green color from CSS variables
 * @returns HSL color string using CSS variable
 */
export function getSingleScoreColor(): string {
  return "hsl(var(--chart-3))";
}

/**
 * Get colors for two-score comparison charts
 * Returns distinct colors to differentiate between two scores
 * @returns Object with color strings for score1 and score2
 */
export function getTwoScoreColors(): {
  score1: string;
  score2: string;
} {
  return {
    score1: "hsl(var(--chart-3))",
    score2: "hsl(var(--chart-2))",
  };
}

/**
 * =======================
 * Monochrome Color Scales for Score Analytics
 * =======================
 * Using chroma-js for perceptually uniform gradients in OKLAB color space
 * Each score gets its own base color, and all values/categories use shades of that color
 */

/**
 * Base colors for score analytics
 * Score 1: Blue (chart-3)
 * Score 2: Yellow (chart-2)
 * These are the single source of truth for score colors
 */
const SCORE_BASE_COLORS = {
  score1: "hsl(var(--chart-3))", // blue
  score2: "hsl(var(--chart-2))", // yellow
} as const;

/**
 * Extract HSL CSS variable and convert to hex for chroma-js
 * Falls back to predefined hex values if CSS variable extraction fails
 * @param cssVar - HSL CSS variable string (e.g., "hsl(var(--chart-3))")
 * @returns Hex color string
 */
function extractHslToHex(cssVar: string): string {
  // Fallback colors if CSS variable extraction fails
  const fallbacks: Record<string, string> = {
    "hsl(var(--chart-1))": "#f97316", // orange
    "hsl(var(--chart-2))": "#eab308", // yellow
    "hsl(var(--chart-3))": "#3b82f6", // blue
    "hsl(var(--chart-4))": "#8b5cf6", // purple
    "hsl(var(--chart-5))": "#ec4899", // pink
  };

  // Return fallback if available
  if (cssVar in fallbacks) {
    return fallbacks[cssVar];
  }

  // Try to extract from DOM if we're in browser environment
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    try {
      const tempDiv = document.createElement("div");
      tempDiv.style.color = cssVar;
      document.body.appendChild(tempDiv);
      const computed = window.getComputedStyle(tempDiv).color;
      document.body.removeChild(tempDiv);

      // Convert rgb/rgba to hex using chroma
      if (computed && computed.startsWith("rgb")) {
        return chroma(computed).hex();
      }
    } catch (_e) {
      // Fall through to default fallback
    }
  }

  // Ultimate fallback - blue
  return "#3b82f6";
}

/**
 * Mix two colors in OKLAB space, matching CSS color-mix behavior
 *
 * CSS equivalent: color-mix(in oklab, baseColor X%, mixColor)
 *
 * @param baseColor - The primary color (e.g., blue for score1)
 * @param mixColor - The color to mix with (e.g., white, gray, etc.)
 * @param percentage - How much of baseColor to use (0-1, where 1 = 100% base)
 * @param minPercentage - Minimum baseColor amount (default: 0.1 = 10%)
 * @param maxPercentage - Maximum baseColor amount (default: 1.0 = 100%)
 * @returns Hex color string
 */
function mixColorsInOklab(
  baseColor: string,
  mixColor: string,
  percentage: number,
  minPercentage = 0.1,
  maxPercentage = 1.0,
): string {
  // Clamp percentage to [min, max] range
  const clampedPercentage = Math.max(
    minPercentage,
    Math.min(maxPercentage, percentage),
  );

  // Mix in OKLAB space
  // chroma.mix(a, b, ratio) where ratio=0 gives 'a', ratio=1 gives 'b'
  // We want clampedPercentage of baseColor, so:
  return chroma.mix(mixColor, baseColor, clampedPercentage, "oklab").hex();
}

/**
 * Generate a monochrome color scale using OKLAB color mixing
 * Creates discrete steps from darker (more baseColor) to lighter (more mixColor)
 *
 * @param baseColor - The base color (e.g., "hsl(var(--chart-3))" or "#3b82f6")
 * @param steps - Number of discrete color steps to generate
 * @param mixColor - Color to mix with (default: 'white')
 * @param minPercentage - Minimum baseColor percentage (default: 0.1 = 10%)
 * @param maxPercentage - Maximum baseColor percentage (default: 1.0 = 100%)
 * @returns Array of hex color strings
 */
function getMonochromeScale(
  baseColor: string,
  steps: number,
  mixColor = "white",
  minPercentage = 0.1,
  maxPercentage = 1.0,
): string[] {
  const baseHex = extractHslToHex(baseColor);
  const colors: string[] = [];

  for (let i = 0; i < steps; i++) {
    // Linearly interpolate from max (darker) to min (lighter)
    // First color has maxPercentage, last color has minPercentage
    const percentage =
      maxPercentage - ((maxPercentage - minPercentage) * i) / (steps - 1);

    colors.push(
      mixColorsInOklab(
        baseHex,
        mixColor,
        percentage,
        minPercentage,
        maxPercentage,
      ),
    );
  }

  return colors;
}

/**
 * Get monochrome color mapping for categorical values
 * All categories of the same score use shades of the same base color
 *
 * IMPORTANT: Sorts categories alphabetically before assigning colors to ensure
 * stable color assignment regardless of category order in the input array.
 * This prevents colors from shifting when categories are hidden/shown.
 *
 * @param scoreNumber - Which score (1 or 2)
 * @param categories - Array of category names
 * @param options - Optional configuration
 * @returns Record mapping category name to color
 */
export function getScoreCategoryColors(
  scoreNumber: 1 | 2,
  categories: string[],
  options?: { reverse?: boolean },
): Record<string, string> {
  const baseColor =
    scoreNumber === 1 ? SCORE_BASE_COLORS.score1 : SCORE_BASE_COLORS.score2;

  // Sort categories alphabetically for stable color assignment
  // This ensures the same category always gets the same color
  const sortedCategories = [...categories].sort();

  // Generate scale with even distribution across percentage range
  // Wider range (20%-100%) for better distinction between categories
  const steps = Math.max(sortedCategories.length, 2);
  const colors = getMonochromeScale(baseColor, steps, "white", 0.2, 1.0);

  // Reverse if requested (for different visual ordering)
  const colorArray = options?.reverse ? [...colors].reverse() : colors;

  // Map categories to colors using sorted order
  const mapping: Record<string, string> = {};
  sortedCategories.forEach((category, index) => {
    mapping[category] = colorArray[index] || colorArray[0];
  });

  return mapping;
}

/**
 * Get monochrome color mapping for boolean values
 * True = darker shade, False = lighter shade
 * @param scoreNumber - Which score (1 or 2)
 * @returns Record with 'True' and 'False' keys
 */
export function getScoreBooleanColors(
  scoreNumber: 1 | 2,
): Record<string, string> {
  const baseColor =
    scoreNumber === 1 ? SCORE_BASE_COLORS.score1 : SCORE_BASE_COLORS.score2;

  // Generate 2-step scale: darker for True (80%), lighter for False (30%)
  // More contrast than before for better distinction
  const colors = getMonochromeScale(baseColor, 2, "white", 0.3, 0.8);

  return {
    True: colors[0], // Darker
    False: colors[1], // Lighter
  };
}

/**
 * Get single color for numeric scores
 * Returns the darkest/most saturated color from the monochrome scale
 * Uses 100% base color (0% white mix) for maximum saturation
 * @param scoreNumber - Which score (1 or 2)
 * @returns Hex color string
 */
export function getScoreNumericColor(scoreNumber: 1 | 2): string {
  const baseColor =
    scoreNumber === 1 ? SCORE_BASE_COLORS.score1 : SCORE_BASE_COLORS.score2;
  // Use darkest color from monochrome scale (100% base color)
  return mixColorsInOklab(extractHslToHex(baseColor), "white", 1.0, 0.1, 1.0);
}

/**
 * Get color for heatmap cells using score-specific monochrome scale
 * Scale goes from 10% (lightest) to 100% (darkest) base color
 * Returns 'transparent' for zero values (special case for empty cells)
 *
 * @param scoreNumber - Which score (1 or 2)
 * @param value - The cell value
 * @param min - Minimum value in the heatmap range
 * @param max - Maximum value in the heatmap range
 * @returns Hex color string or 'transparent' for zero values
 */
export function getHeatmapCellColor(
  scoreNumber: 1 | 2,
  value: number,
  min: number,
  max: number,
): string {
  // Special case: empty cells (value = 0) should be transparent
  if (value === 0) {
    return "transparent";
  }

  const baseColor =
    scoreNumber === 1 ? SCORE_BASE_COLORS.score1 : SCORE_BASE_COLORS.score2;
  const baseHex = extractHslToHex(baseColor);

  // Handle edge cases
  if (max === min) {
    // All values are the same - use middle of range
    return mixColorsInOklab(baseHex, "white", 0.55, 0.1, 1.0);
  }

  // Normalize value to [0, 1] range
  const normalized = (value - min) / (max - min);

  // Map to percentage range [10%, 100%]
  // Higher values get darker colors (higher percentage of base color)
  const percentage = 0.1 + normalized * 0.9;

  return mixColorsInOklab(baseHex, "white", percentage, 0.1, 1.0);
}

/**
 * =======================
 * Color Mapping Keys
 * =======================
 * Constants for special color mapping keys to avoid magic strings
 */
const COLOR_MAPPING_KEYS = {
  SCORE1_NUMERIC: "__score1_numeric__",
  SCORE2_NUMERIC: "__score2_numeric__",
  SCORE2_TRUE: "__score2_True",
  SCORE2_FALSE: "__score2_False",
} as const;

/**
 * =======================
 * Comprehensive Color Mappings Builder
 * =======================
 * Builds complete color mappings for all score analytics visualizations
 */

export interface BuildColorMappingsParams {
  dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
  mode: "single" | "two";
  score1Name: string;
  score2Name?: string;
  score1Source: string;
  score2Source?: string;
  categories?: string[];
  score2Categories?: string[];
}

/**
 * Build comprehensive color mappings for score analytics
 * Handles all data types and creates namespaced versions for "all" and "allMatched" tabs
 *
 * @param params - Configuration for building color mappings
 * @returns Record mapping category/value names to hex colors
 */
export function buildColorMappings(
  params: BuildColorMappingsParams,
): Record<string, string> {
  const mappings: Record<string, string> = {};
  const {
    dataType,
    mode,
    score1Name,
    score2Name,
    score1Source,
    score2Source,
    categories,
    score2Categories,
  } = params;

  // Build score name prefixes for namespaced categories in "all" and "allMatched" tabs
  const score1Prefix =
    mode === "two" && score1Name === score2Name && score1Source !== score2Source
      ? `${score1Name} (${score1Source})`
      : score1Name;

  const score2Prefix =
    mode === "two" &&
    score2Name &&
    score1Name === score2Name &&
    score1Source !== score2Source
      ? `${score2Name} (${score2Source})`
      : (score2Name ?? "");

  // Score 1 color mappings
  if (dataType === "CATEGORICAL" && categories) {
    const categoryColors = getScoreCategoryColors(1, categories);
    Object.assign(mappings, categoryColors);

    // Add namespaced versions for "all" and "allMatched" tabs
    if (mode === "two") {
      categories.forEach((category) => {
        mappings[`${score1Prefix}: ${category}`] = categoryColors[category];
      });
    }
  } else if (dataType === "BOOLEAN" && categories) {
    const booleanColors = getScoreBooleanColors(1);
    Object.assign(mappings, booleanColors);

    // Add namespaced versions for "all" and "allMatched" tabs
    if (mode === "two") {
      categories.forEach((category) => {
        mappings[`${score1Prefix}: ${category}`] = booleanColors[category];
      });
    }
  } else if (dataType === "NUMERIC") {
    mappings[COLOR_MAPPING_KEYS.SCORE1_NUMERIC] = getScoreNumericColor(1);
  }

  // Score 2 color mappings (if exists)
  if (mode === "two") {
    if (dataType === "CATEGORICAL" && score2Categories) {
      const categoryColors = getScoreCategoryColors(2, score2Categories);
      Object.assign(mappings, categoryColors);

      // Add namespaced versions for "all" and "allMatched" tabs
      score2Categories.forEach((category) => {
        mappings[`${score2Prefix}: ${category}`] = categoryColors[category];
      });
    } else if (dataType === "BOOLEAN" && categories) {
      const booleanColors = getScoreBooleanColors(2);
      // Prefix with score2 to avoid collision with score1 boolean values
      mappings[COLOR_MAPPING_KEYS.SCORE2_TRUE] = booleanColors.True;
      mappings[COLOR_MAPPING_KEYS.SCORE2_FALSE] = booleanColors.False;

      // Add namespaced versions for "all" and "allMatched" tabs
      categories.forEach((category) => {
        mappings[`${score2Prefix}: ${category}`] = booleanColors[category];
      });
    } else if (dataType === "NUMERIC") {
      mappings[COLOR_MAPPING_KEYS.SCORE2_NUMERIC] = getScoreNumericColor(2);
    }
  }

  return mappings;
}
