import { useState, useEffect } from "react";

// Keyed to the app's mono font token: the JSON rows render with
// `var(--font-mono)`, so the measurement must use the exact same family or the
// fixed-grid column math drifts. The key includes "font-mono" so widths cached
// under the old generic-monospace measurement are never reused.
const STORAGE_KEY = "font-mono-char-width-0.7rem";
const DEFAULT_CHAR_WIDTH = 6.2; // Fallback for SSR or measurement failure

/**
 * Hook to measure and cache the actual rendered width of monospace characters
 *
 * Measures the width of '0' character in the app's mono font stack
 * (`var(--font-mono)`, same as the JSON viewer rows) at 0.7rem font size.
 * Caches result in sessionStorage to avoid re-measuring.
 *
 * @param fontSize - Font size to measure (default: "0.7rem")
 * @returns Measured character width in pixels
 */
export function useMonospaceCharWidth(fontSize = "0.7rem"): number {
  const [charWidth, setCharWidth] = useState<number>(() => {
    // SSR guard
    if (typeof window === "undefined") {
      return DEFAULT_CHAR_WIDTH;
    }

    // Check sessionStorage first
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = parseFloat(stored);
        if (!isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn(
        "[useMonospaceCharWidth] Failed to read from sessionStorage:",
        error,
      );
    }

    return DEFAULT_CHAR_WIDTH;
  });

  useEffect(() => {
    // Skip if we already have a cached value
    if (charWidth !== DEFAULT_CHAR_WIDTH) {
      return;
    }

    // Skip on server
    if (typeof window === "undefined") {
      return;
    }

    // Measure actual character width
    try {
      // Create invisible measurement element
      const measureEl = document.createElement("span");
      // Must match the fontFamily used by the JSON row components exactly.
      measureEl.style.fontFamily = "var(--font-mono)";
      measureEl.style.fontSize = fontSize;
      measureEl.style.visibility = "hidden";
      measureEl.style.position = "absolute";
      measureEl.style.whiteSpace = "nowrap";
      measureEl.textContent = "0";

      document.body.appendChild(measureEl);

      // Get actual rendered width
      const rect = measureEl.getBoundingClientRect();
      const measuredWidth = rect.width;

      // Clean up
      document.body.removeChild(measureEl);

      // Validate measurement
      if (!isNaN(measuredWidth) && measuredWidth > 0) {
        // Store in sessionStorage
        try {
          sessionStorage.setItem(STORAGE_KEY, measuredWidth.toString());
        } catch (error) {
          console.warn(
            "[useMonospaceCharWidth] Failed to write to sessionStorage:",
            error,
          );
        }

        // Update state
        setCharWidth(measuredWidth);
      } else {
        console.warn(
          "[useMonospaceCharWidth] Invalid measurement:",
          measuredWidth,
          "- using default",
        );
      }
    } catch (error) {
      console.error("[useMonospaceCharWidth] Measurement failed:", error);
      // Keep default value
    }
  }, [fontSize, charWidth]);

  return charWidth;
}
