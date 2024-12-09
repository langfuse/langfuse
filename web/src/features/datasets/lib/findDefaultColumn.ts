export function findDefaultColumn(
  columns: { name: string }[],
  title: string,
  index: number,
): string {
  // Map of card titles to possible column names (case insensitive)
  const columnMappings: Record<string, string[]> = {
    Input: ["input", "prompt", "question", "query"],
    Expected: ["expected", "output", "answer", "response", "completion"],
    Metadata: ["metadata", "meta"],
  };

  // Get possible column names for this title
  const possibleNames = columnMappings[title] ?? [title];

  // Find first matching column (case insensitive)
  return (
    columns.find((col) =>
      possibleNames.some(
        (name) => col.name.toLowerCase() === name.toLowerCase(),
      ),
    )?.name ?? columns[index].name
  );
}
