/** Resolves a monitor name at save time, preserving why a blank name could not be resolved. */
export async function resolveMonitorNameForSave({
  name,
  fallbackName,
  aiAvailable,
  generateName,
}: {
  name: string | undefined;
  fallbackName: string;
  aiAvailable: boolean;
  generateName: () => Promise<string | null>;
}): Promise<MonitorNameResolution> {
  const enteredName = name?.trim();
  if (enteredName) return { status: "resolved", name: enteredName };
  if (!aiAvailable) {
    return fallbackName
      ? { status: "resolved", name: fallbackName }
      : { status: "validation-failed" };
  }

  const generatedName = (await generateName())?.trim();
  return generatedName
    ? { status: "resolved", name: generatedName }
    : { status: "generation-failed" };
}

export type MonitorNameResolution =
  | { status: "resolved"; name: string }
  | { status: "generation-failed" }
  | { status: "validation-failed" };
