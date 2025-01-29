import { distance } from "fastest-levenshtein";

export function findDefaultColumn(
  columns: { name: string }[],
  title: string,
  index: number,
): string | undefined {
  if (columns.length <= index) {
    return undefined;
  }

  const columnMappings: Record<string, string[]> = {
    Input: ["input", "prompt", "question", "query", "instruction"],
    Expected: [
      "expected",
      "output",
      "answer",
      "response",
      "completion",
      "target",
      "result",
    ],
    Metadata: ["metadata", "meta", "tags", "info", "additional"],
  };

  const possibleNames = columnMappings[title] ?? [title];
  const threshold = 0.7; // Similarity threshold (0-1)

  // First try exact matches (case insensitive)
  const exactMatch = columns.find((col) =>
    possibleNames.some((name) => col.name.toLowerCase() === name.toLowerCase()),
  );
  if (exactMatch) return exactMatch.name;

  // Then try fuzzy matching
  let bestMatch = {
    columnName: columns[index]?.name,
    similarity: 0,
  };

  for (const col of columns) {
    for (const name of possibleNames) {
      // Calculate similarity score (0-1)
      const maxLength = Math.max(col.name.length, name.length);
      const similarity =
        1 - distance(col.name.toLowerCase(), name.toLowerCase()) / maxLength;

      if (similarity > threshold && similarity > bestMatch.similarity) {
        bestMatch = {
          columnName: col.name,
          similarity,
        };
      }
    }
  }

  return bestMatch.columnName ?? columns[index].name;
}
