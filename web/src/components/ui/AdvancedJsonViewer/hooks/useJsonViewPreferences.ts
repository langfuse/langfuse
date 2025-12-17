/**
 * useJsonViewPreferences - Hook to manage JSON viewer preferences in localStorage
 *
 * Persists user preferences like string wrap mode across sessions.
 */

import { useState, useEffect, useCallback } from "react";
import { type StringWrapMode } from "../types";

const STORAGE_KEY = "langfuse:json-view-preferences";

export interface JsonViewPreferences {
  stringWrapMode: StringWrapMode;
}

const DEFAULT_PREFERENCES: JsonViewPreferences = {
  stringWrapMode: "wrap",
};

/**
 * Load preferences from localStorage
 */
function loadPreferences(): JsonViewPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCES;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return DEFAULT_PREFERENCES;
    }

    const parsed = JSON.parse(stored) as Partial<JsonViewPreferences>;

    // Validate stringWrapMode
    const stringWrapMode =
      parsed.stringWrapMode === "truncate" ||
      parsed.stringWrapMode === "wrap" ||
      parsed.stringWrapMode === "nowrap"
        ? parsed.stringWrapMode
        : DEFAULT_PREFERENCES.stringWrapMode;

    return {
      stringWrapMode,
    };
  } catch (error) {
    console.warn("Failed to load JSON view preferences:", error);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Save preferences to localStorage
 */
function savePreferences(preferences: JsonViewPreferences): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.warn("Failed to save JSON view preferences:", error);
  }
}

/**
 * Hook to manage JSON viewer preferences
 */
export function useJsonViewPreferences() {
  const [preferences, setPreferences] =
    useState<JsonViewPreferences>(loadPreferences);

  // Save to localStorage whenever preferences change
  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  // Update string wrap mode
  const setStringWrapMode = useCallback((mode: StringWrapMode) => {
    setPreferences((prev) => ({
      ...prev,
      stringWrapMode: mode,
    }));
  }, []);

  return {
    preferences,
    stringWrapMode: preferences.stringWrapMode,
    setStringWrapMode,
  };
}
