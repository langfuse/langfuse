export function groupConsecutiveTools<T>(
  rows: readonly T[],
  options: {
    isTool: (row: T) => boolean;
    getName: (row: T) => string;
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
    const counts = new Map<string, number>();
    for (const tool of tools) {
      const name = options.getName(tool);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const names = Array.from(counts, ([name, count]) =>
      count === 1 ? name : `${count}× ${name}`,
    );
    let summary = names[0]!;
    if (names.length === 2) summary = `${names[0]} and ${names[1]}`;
    if (names.length > 2)
      summary = `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
    if (summary.length > 60) summary = `${tools.length} tools`;
    groups.push({ type: "tools", rows: tools, summary });
  }
  return groups;
}
