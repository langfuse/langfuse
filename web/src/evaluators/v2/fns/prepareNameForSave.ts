export async function prepareNameForSave({
  currentName,
  generateName,
  setName,
}: {
  currentName: string;
  generateName: (() => Promise<string | null>) | null;
  setName: (name: string) => void;
}) {
  const existingName = currentName.trim();
  if (existingName) return existingName;
  if (!generateName) return null;

  const generatedName = (await generateName())?.trim();
  if (!generatedName) return null;

  setName(generatedName);
  return generatedName;
}
