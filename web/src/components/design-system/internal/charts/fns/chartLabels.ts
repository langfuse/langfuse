export function chartLabelLength(label: string): number {
  return Array.from(label).length;
}

export function truncateChartLabel(
  label: string,
  maxCharacters: number,
): string {
  if (maxCharacters < 1) return "";
  if (label.length <= maxCharacters) return label;
  const characters = Array.from(label);
  return characters.length > maxCharacters
    ? `${characters.slice(0, maxCharacters - 1).join("")}…`
    : label;
}
