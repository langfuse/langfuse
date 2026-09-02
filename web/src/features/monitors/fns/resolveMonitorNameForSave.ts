/** Resolves a monitor name at save time, generating blank names when AI assistance is available. */
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
}): Promise<string | null> {
  const enteredName = name?.trim();
  if (enteredName) return enteredName;
  if (!aiAvailable) return fallbackName;

  const generatedName = (await generateName())?.trim();
  return generatedName || null;
}
