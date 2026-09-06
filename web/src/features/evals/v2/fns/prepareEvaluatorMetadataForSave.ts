export async function prepareEvaluatorMetadataForSave({
  currentName,
  currentDescription,
  generateName,
  generateDescription,
  setName,
  setDescription,
}: {
  currentName: string;
  currentDescription: string;
  generateName: (() => Promise<string | null>) | null;
  generateDescription: (() => Promise<string | null>) | null;
  setName: (name: string) => void;
  setDescription: (description: string) => void;
}) {
  const existingName = currentName.trim();
  const existingDescription = currentDescription.trim();
  const needsName = !existingName;
  const needsDescription = !existingDescription;
  const [nameSuggestion, descriptionSuggestion] = await Promise.all([
    needsName ? generateName?.() : null,
    needsDescription ? generateDescription?.() : null,
  ]);
  const generatedName = nameSuggestion?.trim() ?? "";
  const generatedDescription = descriptionSuggestion?.trim() ?? "";
  const name = existingName || generatedName;
  const description = existingDescription || generatedDescription;

  if (!name) return null;
  if (needsName && generatedName) setName(generatedName);
  if (needsDescription && generatedDescription) {
    setDescription(generatedDescription);
  }

  return { name, description: description || null };
}
