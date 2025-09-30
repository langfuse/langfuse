/**
 * Migration utility to update existing localStorage experiments
 * to include originalPromptName field for regression run compatibility
 */

interface LegacyExperiment {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  promptCount: number;
  status: "active" | "completed";
  prompts: any[];
  originalPromptName?: string; // May not exist in legacy data
}

export function migrateExperimentsInLocalStorage(): void {
  // Only run in browser environment
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }

  try {
    const stored = localStorage.getItem("promptExperiments");
    if (!stored) return;

    const experiments: LegacyExperiment[] = JSON.parse(stored);
    let hasChanges = false;

    const updatedExperiments = experiments.map((exp) => {
      // Skip if already has originalPromptName
      if (exp.originalPromptName) return exp;

      // Extract original prompt name by removing " Experiment" suffix
      const originalPromptName = exp.name.replace(/ Experiment$/, "");

      // Only update if the name actually had the " Experiment" suffix
      if (originalPromptName !== exp.name) {
        hasChanges = true;
        return {
          ...exp,
          originalPromptName,
        };
      }

      return exp;
    });

    // Save back to localStorage if changes were made
    if (hasChanges) {
      localStorage.setItem(
        "promptExperiments",
        JSON.stringify(updatedExperiments),
      );
      console.log(
        `Migrated ${updatedExperiments.filter((e) => e.originalPromptName).length} experiments to include originalPromptName`,
      );
    }
  } catch (error) {
    console.error("Failed to migrate experiments in localStorage:", error);
  }
}

/**
 * Call this function when the experiments page loads to ensure
 * existing experiments work with regression runs
 */
export function ensureExperimentCompatibility(): void {
  // Only run in browser environment
  if (typeof window === "undefined") {
    return;
  }
  migrateExperimentsInLocalStorage();
}
