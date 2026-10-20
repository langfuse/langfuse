export function groupConsecutiveTools<T>(
  rows: readonly T[],
  options: {
    isTool: (row: T) => boolean;
    getBoundary: (row: T) => string | number | undefined;
    getToolName: (row: T) => string | null | undefined;
    summaryBudget: number;
    minGroupSize: number;
    measureSummary?: (summary: string) => number;
  },
) {
  const measureSummary =
    options.measureSummary ?? ((summary: string) => summary.length);
  const groups: Array<
    | { type: "row"; row: T }
    | { type: "tools"; rows: T[]; summary: string; title: string }
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
    if (tools.length < options.minGroupSize) {
      for (const tool of tools) {
        groups.push({ type: "row", row: tool });
      }
      continue;
    }
    const counts = new Map<string, number>();
    for (const tool of tools) {
      const name = options.getToolName(tool)?.trim() || "Tool";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const names = [...counts].sort((a, b) => b[1] - a[1]);
    const labels = names.map(([name, count]) =>
      count > 1 ? `${count}x ${name}` : name,
    );
    const title = labels.join(" · ");
    let shown =
      measureSummary(title) <= options.summaryBudget ? names.length : 0;
    while (shown < names.length) {
      const omitted = names
        .slice(shown + 1)
        .reduce((sum, [, count]) => sum + count, 0);
      const candidate =
        labels.slice(0, shown + 1).join(" · ") +
        (omitted ? ` · +${omitted} more` : "");
      if (measureSummary(candidate) > options.summaryBudget) break;
      shown++;
    }
    if (shown === 0) {
      const [name, count] = names[0]!;
      const prefix = count > 1 ? `${count}x ` : "";
      const remainingCalls = tools.length - count;
      const firstSuffix = remainingCalls ? ` · +${remainingCalls} more` : "";
      const characters = [...name];
      let fittingLength = 0;
      let upperBound = characters.length;
      while (fittingLength < upperBound) {
        const length = Math.ceil((fittingLength + upperBound) / 2);
        const candidate =
          prefix + characters.slice(0, length).join("") + "…" + firstSuffix;
        if (measureSummary(candidate) <= options.summaryBudget)
          fittingLength = length;
        else upperBound = length - 1;
      }
      labels[0] = prefix + characters.slice(0, fittingLength).join("") + "…";
      shown = 1;
    }
    const omitted = names
      .slice(shown)
      .reduce((sum, [, count]) => sum + count, 0);
    const suffix = omitted ? ` · +${omitted} more` : "";
    const summary = labels.slice(0, shown).join(" · ") + suffix;
    groups.push({ type: "tools", rows: tools, summary, title });
  }
  return groups;
}
