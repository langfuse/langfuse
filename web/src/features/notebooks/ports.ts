import {
  notebookVariableValue,
  type NotebookBlock,
  type NotebookLayout,
  type NotebookVariable,
} from "./schema";

type Binding = NonNullable<NotebookLayout["bindings"]>[number];
type PortRef = Extract<Binding, { kind: "read" }>["to"];

export function getNotebookPorts(block: NotebookBlock) {
  if (block.schema === "button@1") {
    return [{ id: "traceId", direction: "input", type: "string" }] as const;
  }
  if (block.schema === "embed@1") {
    return [{ id: "resourceId", direction: "input", type: "string" }] as const;
  }
  if (block.schema === "table@1") {
    return [
      {
        id: "selection",
        direction: "output",
        type: "string",
        choices: block.props.rows.map(({ id, cells }) => ({
          value: id,
          label: String(cells[0] ?? id),
        })),
      },
    ] as const;
  }
  if (block.schema === "chart@1") {
    const index = block.props.bindFilter;
    const filter =
      index === undefined ? undefined : block.props.query.filters[index];
    const time = {
      id: "timeRange",
      direction: "input",
      type: "dateRange",
    } as const;
    if (filter?.type === "string" && filter.operator === "=") {
      return [
        time,
        { id: "filter", direction: "input", type: "string" },
      ] as const;
    }
    return [time] as const;
  }
  return [];
}

export function resolveNotebookPort(
  blocks: NotebookBlock[],
  ref: PortRef,
): ReturnType<typeof getNotebookPorts>[number] | undefined {
  for (const block of blocks) {
    if (block.id === ref.elementId)
      return getNotebookPorts(block).find(({ id }) => id === ref.portId);
    if (block.schema === "row@1") {
      const port = resolveNotebookPort(block.props.children, ref);
      if (port) return port;
    }
  }
}

export function matchesNotebookVariable(
  variable: NotebookVariable,
  value: unknown,
) {
  const parsed = notebookVariableValue.safeParse(value);
  if (!parsed.success) return false;
  if (variable.type === "dateRange") return typeof parsed.data === "object";
  return typeof parsed.data === variable.type;
}
