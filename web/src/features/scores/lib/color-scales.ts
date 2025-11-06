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
export const HEATMAP_BASE_COLORS = {
  chart1: { l: 66.2, c: 0.225, h: 25.9 }, // --color-1 (orange-ish)
  chart2: { l: 60.4, c: 0.26, h: 302 }, // --color-2 (magenta-ish)
  chart3: { l: 69.6, c: 0.165, h: 251 }, // --color-3 (blue-ish)
  chart4: { l: 80.2, c: 0.134, h: 225 }, // --color-4 (light blue-ish)
  chart5: { l: 90.7, c: 0.231, h: 133 }, // --color-5 (green-ish)
  accent: { l: 65, c: 0.1, h: 240 }, // --accent (blue-ish, muted but visible)
} as const;

export type HeatmapColorVariant = keyof typeof HEATMAP_BASE_COLORS;

/**
 * Generate a mono-color scale by varying lightness in OKLCH space
 * @param baseColor - The base color to vary
 * @param steps - Number of color steps to generate (default: 10)
 * @param minLightness - Minimum lightness value (0-100, default: 30)
 * @param maxLightness - Maximum lightness value (0-100, default: 95)
 * @returns Array of OKLCH color strings
 */
export function generateMonoColorScale(
  baseColor: { l: number; c: number; h: number },
  steps: number = 10,
  minLightness: number = 30,
  maxLightness: number = 95,
): string[] {
  const colors: string[] = [];
  const lightnessRange = maxLightness - minLightness;

  for (let i = 0; i < steps; i++) {
    // Linear interpolation of lightness (reversed: darker = higher values)
    const lightness = maxLightness - (lightnessRange * i) / (steps - 1);
    // Keep chroma and hue constant for mono-color
    colors.push(`oklch(${lightness}% ${baseColor.c} ${baseColor.h})`);
  }

  return colors;
}

/**
 * Get a color from a mono-color scale based on a value
 * @param value - The value to map to a color
 * @param min - The minimum value in the range
 * @param max - The maximum value in the range
 * @param variant - Which chart color variant to use (default: 'chart1')
 * @param steps - Number of color steps (default: 10)
 * @returns OKLCH color string
 */
export function getColorFromMonoScale(
  value: number,
  min: number,
  max: number,
  variant: HeatmapColorVariant = "chart1",
  steps: number = 10,
): string {
  const baseColor = HEATMAP_BASE_COLORS[variant];
  const scale = generateMonoColorScale(baseColor, steps);

  // Handle edge cases
  if (value <= min) return scale[0];
  if (value >= max) return scale[scale.length - 1];
  if (max === min) return scale[0];

  // Normalize value to [0, 1]
  const normalized = (value - min) / (max - min);

  // Map to color scale index
  const index = Math.floor(normalized * (scale.length - 1));

  return scale[index];
}

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
 * Increase the chroma (saturation) of an OKLCH color for hover effects
 * @param oklchColor - OKLCH color string (e.g., "oklch(66.2% 0.08 240)")
 * @param chromaMultiplier - How much to multiply chroma by (default: 2.5)
 * @returns OKLCH color string with increased chroma
 */
export function getHoverColor(
  oklchColor: string,
  chromaMultiplier: number = 2.5,
): string {
  // Parse OKLCH color
  const match = oklchColor.match(
    /oklch\((\d+\.?\d*)%\s+(\d+\.?\d*)\s+(\d+\.?\d*)\)/,
  );
  if (!match) return oklchColor;

  const lightness = parseFloat(match[1]);
  const chroma = parseFloat(match[2]);
  const hue = parseFloat(match[3]);

  // Increase chroma for hover effect, but cap at reasonable max
  const newChroma = Math.min(chroma * chromaMultiplier, 0.37);

  return `oklch(${lightness}% ${newChroma} ${hue})`;
}

/**
 * Create a custom mono-color scale with specific lightness range
 * Useful for categorical data where you want to emphasize differences
 * @param variant - Which chart color variant to use
 * @param minLightness - Minimum lightness (0-100)
 * @param maxLightness - Maximum lightness (0-100)
 * @param steps - Number of steps
 */
export function createCustomMonoScale(
  variant: HeatmapColorVariant,
  minLightness: number,
  maxLightness: number,
  steps: number,
): string[] {
  const baseColor = HEATMAP_BASE_COLORS[variant];
  return generateMonoColorScale(baseColor, steps, minLightness, maxLightness);
}

/**
 * Get a color for diagonal cells in confusion matrix
 * Uses higher chroma for emphasis
 * @param value - The value to map to a color
 * @param min - The minimum value in the range
 * @param max - The maximum value in the range
 * @param variant - Which chart color variant to use
 */
export function getDiagonalColor(
  value: number,
  min: number,
  max: number,
  variant: HeatmapColorVariant = "chart1",
): string {
  const baseColor = HEATMAP_BASE_COLORS[variant];

  // Handle edge cases
  if (max === min) return `oklch(60% ${baseColor.c * 2} ${baseColor.h})`;

  // Normalize value to [0, 1]
  const normalized = (value - min) / (max - min);

  // Vary lightness from 80% to 40% (reversed: higher values = darker), with higher chroma for emphasis
  const lightness = 80 - normalized * 40;

  return `oklch(${lightness}% ${baseColor.c * 2} ${baseColor.h})`;
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
 * Get opacity values for bar chart hover states
 * @param isHovered - Whether the current bar is being hovered
 * @param hasActiveHover - Whether any bar is currently being hovered
 * @returns Opacity value (0-1)
 */
export function getBarChartHoverOpacity(
  isHovered: boolean,
  hasActiveHover: boolean,
): number {
  if (!hasActiveHover) {
    // No hover active - all bars at full opacity
    return 1;
  }
  if (isHovered) {
    // This bar is hovered - full opacity
    return 1;
  }
  // Another bar is hovered - dim this one
  return 0.3;
}

/**
 * Chart color configuration for Recharts ChartConfig
 * Single score variant
 */
export function getSingleScoreChartConfig(metricKey: string) {
  return {
    [metricKey]: {
      theme: {
        light: getSingleScoreColor(),
        dark: getSingleScoreColor(),
      },
    },
  };
}

/**
 * Chart color configuration for Recharts ChartConfig
 * Two score comparison variant
 */
export function getTwoScoreChartConfig(score1Key: string, score2Key: string) {
  const colors = getTwoScoreColors();
  return {
    [score1Key]: {
      theme: {
        light: colors.score1,
        dark: colors.score1,
      },
    },
    [score2Key]: {
      theme: {
        light: colors.score2,
        dark: colors.score2,
      },
    },
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
export const SCORE_BASE_COLORS = {
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
    } catch (e) {
      // Fall through to default fallback
    }
  }

  // Ultimate fallback - blue
  return "#3b82f6";
}

/**
 * Generate a monochrome color scale using chroma-js with OKLAB interpolation
 * Creates perceptually uniform gradients from darker to lighter shades
 * @param baseColor - CSS color string (e.g., "hsl(var(--chart-3))")
 * @param steps - Number of color steps to generate
 * @param minIntensity - Minimum intensity (0-1, where 0=white, 1=full color)
 * @param maxIntensity - Maximum intensity (0-1, where 0=white, 1=full color)
 * @returns Array of hex color strings
 */
export function getMonochromeScale(
  baseColor: string,
  steps: number,
  minIntensity: number = 0.3,
  maxIntensity: number = 0.9,
): string[] {
  const baseHex = extractHslToHex(baseColor);

  // Create scale from lighter (white-ish) to darker (full color) using OKLAB
  // OKLAB provides perceptually uniform interpolation
  const scale = chroma
    .scale([chroma(baseHex).brighten(2), baseHex])
    .mode("oklab")
    .colors(steps);

  // Map intensities: higher values = darker colors
  return scale.map((color, index) => {
    const intensity =
      maxIntensity - ((maxIntensity - minIntensity) * index) / (steps - 1);
    return chroma.mix("white", color, intensity, "oklab").hex();
  });
}

/**
 * Get monochrome color mapping for categorical values
 * All categories of the same score use shades of the same base color
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

  // Generate scale with even distribution across intensity range
  const steps = Math.max(categories.length, 2);
  const colors = getMonochromeScale(baseColor, steps, 0.3, 0.9);

  // Reverse if requested (for different visual ordering)
  const colorArray = options?.reverse ? [...colors].reverse() : colors;

  // Map categories to colors
  const mapping: Record<string, string> = {};
  categories.forEach((category, index) => {
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

  // Generate 2-step scale: darker for True (70%), lighter for False (30%)
  const colors = getMonochromeScale(baseColor, 2, 0.3, 0.7);

  return {
    True: colors[0], // Darker
    False: colors[1], // Lighter
  };
}

/**
 * Get single color for numeric scores
 * Returns the base color at full intensity
 * @param scoreNumber - Which score (1 or 2)
 * @returns Hex color string
 */
export function getScoreNumericColor(scoreNumber: 1 | 2): string {
  const baseColor =
    scoreNumber === 1 ? SCORE_BASE_COLORS.score1 : SCORE_BASE_COLORS.score2;
  return extractHslToHex(baseColor);
}
