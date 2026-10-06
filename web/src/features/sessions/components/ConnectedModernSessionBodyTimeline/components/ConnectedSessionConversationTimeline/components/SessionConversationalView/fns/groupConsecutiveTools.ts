export function groupConsecutiveTools<T>(
  rows: readonly T[],
  options: {
    isTool: (row: T) => boolean;
    getBoundary: (row: T) => string | number | undefined;
  },
) {
  const groups: Array<
    { type: "row"; row: T } | { type: "tools"; rows: T[]; summary: string }
  > = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!;
    if (!options.isTool(row)) {
      groups.push({ type: "row", row });
      continue;
    }
    const tools = [row];
    while (
      index + 1 < rows.length &&
      options.isTool(rows[index + 1]!) &&
      options.getBoundary(rows[index + 1]!) === options.getBoundary(row)
    ) {
      tools.push(rows[++index]!);
    }
    if (tools.length === 1) {
      groups.push({ type: "row", row });
      continue;
    }
    const summary = `${tools.length} tool calls`;
    groups.push({ type: "tools", rows: tools, summary });
  }
  return groups;
}
