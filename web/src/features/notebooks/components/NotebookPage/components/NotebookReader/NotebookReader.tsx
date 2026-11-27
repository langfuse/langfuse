import {
  notebookActionSchema,
  type NotebookAction,
} from "@/src/features/notebooks/schema";
import { NotebookActionButton } from "./NotebookActionButton";
import { NotebookChart } from "../NotebookChart/NotebookChart";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { ArrowUpDown, Check } from "@langfuse/icons";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { DateRangeInput } from "@/src/components/design-system/DateRangeInput/DateRangeInput";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Skeleton } from "@/src/components/ui/skeleton";
import { TableCard } from "@/src/components/TableCard/TableCard";
import { readingColumnClassName } from "@/src/components/layouts/reading-column";
import {
  type NotebookBlock,
  type NotebookLayout,
  type NotebookPropertySchema,
  type NotebookPropertyValues,
  type NotebookVariableValue,
} from "@/src/features/notebooks/schema";
import {
  matchesNotebookVariable,
  resolveNotebookPort,
} from "@/src/features/notebooks/ports";
import { cn } from "@/src/utils/tailwind";
import { type RouterOutput } from "@/src/utils/types";
import { api } from "@/src/utils/api";
import type { RouterInput } from "@/src/utils/types";
import { NotebookBlocks } from "./components/NotebookBlocks/NotebookBlocks";
import { getNotebookPresentationWarnings } from "@/src/features/notebooks/presentation";

const NOTEBOOK_CREATION_WINDOW_MS = 2 * 60 * 1000;

function formatProperty(
  value: NotebookPropertyValues[string] | undefined,
  type: string,
) {
  if (value === undefined) return;
  if (Array.isArray(value)) return value.length ? value.join(", ") : undefined;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (type === "date") {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value));
  }
  return value;
}

function renderProperty(
  field: NotebookPropertySchema["fields"][number],
  value: NotebookPropertyValues[string] | undefined,
) {
  if (!("options" in field) || value === undefined) {
    return formatProperty(value, field.type);
  }
  const values = Array.isArray(value) ? value : [String(value)];
  return values.map((text, index) => {
    const option = field.options.find(
      (option) => typeof option !== "string" && option.value === text,
    );
    const color = typeof option === "object" ? option.color : undefined;
    return (
      <Fragment key={index}>
        {index > 0 && ", "}
        {color ? (
          <Badge
            size="sm"
            color={
              (
                {
                  danger: "error",
                  neutral: "filled",
                  warning: "warning",
                  success: "success",
                  info: "info",
                } as const
              )[color]
            }
            text={text}
          />
        ) : (
          text
        )}
      </Fragment>
    );
  });
}

function NotebookReaderContent({
  view,
  unpublishedUpdatedAt,
  liveTableIds = [],
  liveQueries = [],
  isLoadingDocument,
  onDocumentChange,
  renderChart,
  renderEmbed,
  onExecuteAction,
  showControlledVariables = false,
}: {
  view: Pick<RouterOutput["notebooks"]["view"], "documents" | "version"> &
    Pick<RouterOutput["notebooks"]["view"]["document"], "blocks"> & {
      documentId: RouterOutput["notebooks"]["view"]["document"]["id"];
      layout: NotebookLayout;
      variables?: RouterOutput["notebooks"]["view"]["variables"];
      bindings?: RouterOutput["notebooks"]["view"]["bindings"];
    };
  isLoadingDocument: boolean;
  unpublishedUpdatedAt?: Date;
  liveTableIds?: string[];
  liveQueries?: ReturnType<typeof useLiveTableQueries>;
  onDocumentChange: (documentId: string | null, version: number | null) => void;
  renderChart: ComponentProps<typeof NotebookBlocks>["renderChart"];
  renderEmbed?: (
    kind: Extract<
      NotebookBlock,
      { schema: "embed@1" }
    >["props"]["target"]["kind"],
    resourceId: string | undefined,
    variableName: string | undefined,
    sidebar?: "expanded" | "collapsed",
    observationId?: string,
  ) => ReactNode;
  onExecuteAction?: (
    action: NotebookAction,
    blockId: string,
  ) => Promise<unknown>;
  showControlledVariables?: boolean;
}) {
  function resolveStringInput(
    elementId: string,
    portId: string,
    fallback: string | undefined,
  ) {
    const binding = bindings.find(
      (binding) =>
        binding.kind === "read" &&
        binding.to.documentId === documentId &&
        binding.to.elementId === elementId &&
        binding.to.portId === portId,
    );
    if (!binding) return { value: fallback, variableName: undefined };

    const variable = variables.find(({ id }) => id === binding.variableId);
    const value = variable && valueOf(variable);
    const isControlled = writes.some(
      ({ variableId }) => variableId === binding.variableId,
    );
    const isAvailable =
      !isControlled ||
      choicesByVariableId
        .get(binding.variableId)
        ?.some(({ value: choice }) => choice === value);
    return {
      value: isAvailable && typeof value === "string" ? value : undefined,
      variableName: variable?.name,
      isBound: true,
    };
  }

  const { blocks, documentId, documents, layout, version } = view;
  const documentScroll = useRef<HTMLDivElement>(null);
  const documentBody = useRef<HTMLDivElement>(null);
  const [lastFreshnessCheck, setLastFreshnessCheck] = useState(Date.now);
  const skeletonExpiresAt = unpublishedUpdatedAt
    ? unpublishedUpdatedAt.getTime() + NOTEBOOK_CREATION_WINDOW_MS
    : 0;
  const showCreationSkeleton =
    !isLoadingDocument && skeletonExpiresAt > lastFreshnessCheck;
  useEffect(() => {
    if (!showCreationSkeleton) return;
    const timeout = window.setTimeout(
      () => setLastFreshnessCheck(Math.max(Date.now(), skeletonExpiresAt)),
      Math.max(0, skeletonExpiresAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [showCreationSkeleton, skeletonExpiresAt]);

  const followCreation =
    unpublishedUpdatedAt !== undefined && !isLoadingDocument;
  useLayoutEffect(() => {
    const scroll = documentScroll.current;
    const body = documentBody.current;
    if (!followCreation || !scroll || !body) return;

    const atBottom = () =>
      scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 2;
    let followBottom = atBottom();
    const onScroll = () => {
      followBottom = atBottom();
    };
    const resize = new ResizeObserver(() => {
      if (followBottom) scroll.scrollTop = scroll.scrollHeight;
    });
    scroll.addEventListener("scroll", onScroll, { passive: true });
    resize.observe(body);
    resize.observe(scroll);
    return () => {
      scroll.removeEventListener("scroll", onScroll);
      resize.disconnect();
    };
  }, [documentId, layout.kind, followCreation]);
  const wide = layout.kind === "inbox" || layout.width === "full";
  const presentationWarnings =
    version === null && !isLoadingDocument
      ? getNotebookPresentationWarnings(blocks, wide)
      : [];
  const [overrides, setOverrides] = useState<
    ReadonlyMap<string, NotebookVariableValue | undefined>
  >(new Map());
  const [liveSelectedRows, setLiveSelectedRows] = useState<
    ReadonlyMap<string, string>
  >(new Map());
  const [savedScores, setSavedScores] = useState<ReadonlyMap<string, number>>(
    new Map(),
  );
  const variables = view.variables ?? layout.variables ?? [];
  const bindings = view.bindings ?? layout.bindings ?? [];
  const writes = bindings.filter((binding) => binding.kind === "write");
  const choicesByVariableId = new Map(
    view.variables?.flatMap(({ id, choices }) =>
      choices === undefined ? [] : [[id, choices] as const],
    ),
  );
  for (const { from, variableId } of writes) {
    const liveIndex =
      from.documentId === documentId
        ? liveTableIds.indexOf(from.elementId)
        : -1;
    if (liveIndex >= 0) {
      choicesByVariableId.set(
        variableId,
        (liveQueries[liveIndex]?.data ?? []).flatMap(({ value, cells }) =>
          value ? [{ value, label: cells[0] || value }] : [],
        ),
      );
      continue;
    }
    if (from.documentId !== documentId || choicesByVariableId.has(variableId))
      continue;
    const port = resolveNotebookPort(blocks, from);
    if (port?.direction === "output")
      choicesByVariableId.set(variableId, port.choices);
  }
  const valueOf = (variable: (typeof variables)[number]) =>
    overrides.has(variable.id)
      ? overrides.get(variable.id)
      : variable.defaultValue;
  const setValue = (id: string, value: NotebookVariableValue | undefined) =>
    setOverrides((current) => new Map(current).set(id, value));
  const labelOf = (value: NotebookVariableValue | undefined) =>
    value === undefined
      ? "Not set"
      : typeof value === "object"
        ? `${value.start} – ${value.end}`
        : String(value);
  const [sort, setSort] = useState("");
  const metadata =
    layout.kind === "default"
      ? layout.document
      : layout.documents.find((document) => document.documentId === documentId);
  const headerProperties = (layout.propertySchema?.fields ?? []).flatMap(
    (field) => {
      const displayValue = formatProperty(
        metadata?.properties?.[field.id],
        field.type,
      );
      if (displayValue === undefined) return [];
      return [{ field, value: metadata?.properties?.[field.id] }];
    },
  );
  const visibleVariables = variables.filter(
    ({ id }) =>
      showControlledVariables ||
      !writes.some(({ variableId }) => variableId === id),
  );
  const variablesToolbar = visibleVariables.length > 0 && (
    <div
      className="shrink-0 border-b"
      role="group"
      aria-label="Notebook variables"
    >
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2 py-2 text-sm",
          wide ? "px-4" : readingColumnClassName,
        )}
      >
        {visibleVariables.map((variable) => {
          const source = writes.find(
            (binding) => binding.variableId === variable.id,
          );
          const value = valueOf(variable);
          if (source) {
            const choices = choicesByVariableId.get(variable.id);
            const selected = choices?.find((choice) => choice.value === value);
            let placeholder = "Select a value";
            if (!choices) placeholder = "Choices unavailable";
            else if (!choices.length) placeholder = "No choices available";
            else if (!selected && value !== undefined)
              placeholder = "Selection unavailable";
            return (
              <div
                key={variable.id}
                className="flex min-w-0 items-center gap-2"
              >
                <span>{variable.name}</span>
                <SelectInput
                  aria-label={variable.name}
                  disabled={!choices?.length}
                  options={choices ?? []}
                  placeholder={placeholder}
                  value={selected?.value ?? ""}
                  onValueChange={(next) => {
                    if (choices?.some(({ value }) => value === next))
                      setValue(variable.id, next);
                  }}
                  noCapture
                />
              </div>
            );
          }
          if (variable.type === "dateRange") {
            return (
              <div key={variable.id} className="max-w-full min-w-0">
                <DateRangeInput
                  aria-label={variable.name}
                  value="custom"
                  customValue="custom"
                  presets={[]}
                  onPresetChange={() => {}}
                  range={
                    typeof value === "object"
                      ? { from: new Date(value.start), to: new Date(value.end) }
                      : undefined
                  }
                  onCustomChange={({ from, to }) =>
                    setValue(variable.id, {
                      start: from.toISOString(),
                      end: to.toISOString(),
                    })
                  }
                />
              </div>
            );
          }
          if (variable.type === "boolean") {
            return (
              <div key={variable.id} className="flex items-center gap-2">
                <span>{variable.name}</span>
                <SelectInput
                  aria-label={variable.name}
                  placeholder="Not set"
                  value={
                    value === undefined
                      ? "unset"
                      : value === true
                        ? "true"
                        : "false"
                  }
                  options={[
                    { value: "unset", label: "Not set" },
                    { value: "true", label: "True" },
                    { value: "false", label: "False" },
                  ]}
                  onValueChange={(selected) =>
                    setValue(
                      variable.id,
                      selected === "unset" ? undefined : selected === "true",
                    )
                  }
                />
              </div>
            );
          }
          return (
            <div key={variable.id} className="w-48 max-w-full">
              <Input
                aria-label={variable.name}
                prefix={{ label: variable.name }}
                placeholder="Not set"
                type={variable.type === "number" ? "number" : "text"}
                step={variable.type === "number" ? "any" : undefined}
                maxLength={2048}
                value={
                  typeof value === "number" || typeof value === "string"
                    ? value
                    : ""
                }
                onChange={(event) => {
                  const text = event.target.value;
                  setValue(
                    variable.id,
                    text === ""
                      ? undefined
                      : variable.type === "number"
                        ? event.target.valueAsNumber
                        : text,
                  );
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
  const documentContent = (() => {
    if (isLoadingDocument) {
      return (
        <div
          className="flex justify-center py-12"
          role="status"
          aria-label="Loading notebook version"
        >
          <Spinner size="md" />
        </div>
      );
    }
    if (!blocks.length) {
      return (
        <p className="text-muted-foreground text-sm">This document is empty.</p>
      );
    }
    return (
      <NotebookBlocks
        blocks={blocks}
        allowWideRows
        renderEmbed={(block) => {
          const { target } = block.props;
          const observation =
            target.kind === "trace"
              ? resolveStringInput(block.id, "observationId", undefined)
              : undefined;
          const { value, variableName } = resolveStringInput(
            block.id,
            "resourceId",
            target.id,
          );
          return renderEmbed?.(
            target.kind,
            observation?.isBound ? undefined : value,
            observation?.isBound ? observation.variableName : variableName,
            target.kind === "trace" ? target.sidebar : undefined,
            observation?.value,
          );
        }}
        renderButton={(block) => {
          const { action, label } = block.props;
          const { value: traceId } = resolveStringInput(
            block.id,
            "traceId",
            action.inputs.traceId,
          );
          const parsed = notebookActionSchema.safeParse({
            ...action,
            inputs: { ...action.inputs, traceId },
          });
          const scoreKey = JSON.stringify([
            action.type,
            traceId,
            action.inputs.name,
          ]);
          return (
            <NotebookActionButton
              key={JSON.stringify(parsed.data ?? block.id)}
              label={label}
              saved={
                parsed.success &&
                savedScores.get(scoreKey) === action.inputs.value
              }
              execute={
                parsed.success && onExecuteAction
                  ? async () => {
                      await onExecuteAction(parsed.data, block.id);
                      setSavedScores((previous) =>
                        new Map(previous).set(
                          scoreKey,
                          parsed.data.inputs.value,
                        ),
                      );
                    }
                  : undefined
              }
            />
          );
        }}
        renderTable={(table) => {
          const props = table.props;
          if ("source" in props) {
            const query = liveQueries[liveTableIds.indexOf(table.id)];
            const rows = query?.data ?? [];
            const targets = writes.filter(
              ({ from }) =>
                from.documentId === documentId &&
                from.elementId === table.id &&
                from.portId === "selection",
            );
            const selectionKey = `${documentId}:${table.id}`;
            const selected = rows.find(
              ({ id }) => id === liveSelectedRows.get(selectionKey),
            );
            return (
              <div className="flex min-w-0 grow flex-col gap-2">
                <span className="text-muted-foreground text-xs">Live</span>
                <TableCard<(typeof rows)[number]>
                  stretch
                  tableName="notebook-live-table"
                  data={
                    query?.isError
                      ? {
                          status: "error",
                          error: "Could not load live observations.",
                        }
                      : query?.isSuccess
                        ? { status: "success", data: rows }
                        : { status: "loading" }
                  }
                  selectedRowId={selected?.id}
                  onRowClick={
                    targets.length
                      ? ({ id, value }) => {
                          if (!value) return;
                          const clear = selected?.id === id;
                          setLiveSelectedRows((current) => {
                            const next = new Map(current);
                            if (clear) next.delete(selectionKey);
                            else next.set(selectionKey, id);
                            return next;
                          });
                          setOverrides((current) => {
                            const next = new Map(current);
                            for (const { variableId } of targets)
                              next.set(variableId, clear ? undefined : value);
                            return next;
                          });
                        }
                      : undefined
                  }
                  columns={props.columns.map(({ label }, index) => ({
                    id: `column-${index}`,
                    accessorKey: `column-${index}`,
                    header: label,
                    accessorFn: (row) => row.cells[index],
                  }))}
                />
              </div>
            );
          }
          const variableIds = new Set(
            writes
              .filter(
                ({ from }) =>
                  from.documentId === documentId &&
                  from.elementId === table.id &&
                  from.portId === "selection",
              )
              .map(({ variableId }) => variableId),
          );
          const targets = variables.filter(
            ({ id, type }) => variableIds.has(id) && type === "string",
          );
          const selectedRow = props.rows.find(({ id }) =>
            targets.some((variable) => valueOf(variable) === id),
          );
          const toggleRow = (id: string) =>
            setOverrides((current) => {
              const isSelected = targets.some(
                (variable) =>
                  (current.has(variable.id)
                    ? current.get(variable.id)
                    : variable.defaultValue) === id,
              );
              const overrides = new Map(current);
              for (const target of targets)
                overrides.set(target.id, isSelected ? undefined : id);
              return overrides;
            });
          return (
            <div data-notebook-table className="flex min-w-0 grow flex-col">
              <TableCard<(typeof props.rows)[number]>
                stretch
                tableName="notebook-inline-table"
                data={{ status: "success", data: props.rows }}
                onRowClick={
                  targets.length ? ({ id }) => toggleRow(id) : undefined
                }
                selection={
                  targets.length > 0
                    ? {
                        value: selectedRow ? { [selectedRow.id]: true } : {},
                        getLabel: ({ id, cells }) => String(cells[0] ?? id),
                        onChange: (update) =>
                          setOverrides((current) => {
                            const currentRow = props.rows.find(({ id }) =>
                              targets.some(
                                (variable) =>
                                  (current.has(variable.id)
                                    ? current.get(variable.id)
                                    : variable.defaultValue) === id,
                              ),
                            );
                            const selection =
                              typeof update === "function"
                                ? update(
                                    currentRow ? { [currentRow.id]: true } : {},
                                  )
                                : update;
                            const next = props.rows.find(
                              ({ id }) => selection[id] === true,
                            );
                            const overrides = new Map(current);
                            for (const { id } of targets)
                              overrides.set(id, next?.id);
                            return overrides;
                          }),
                      }
                    : undefined
                }
                columns={props.columns.map((header, index) => ({
                  id: `column-${index}`,
                  accessorKey: `column-${index}`,
                  header,
                  accessorFn: (row) => row.cells[index],
                }))}
              />
            </div>
          );
        }}
        renderChart={(block) => {
          const values: NonNullable<Parameters<typeof renderChart>[1]> = {};
          const labels: string[] = [];
          for (const binding of bindings) {
            if (
              binding.kind !== "read" ||
              binding.to.documentId !== documentId ||
              binding.to.elementId !== block.id
            )
              continue;
            const portId = binding.to.portId;
            const variable = variables.find(
              ({ id }) => id === binding.variableId,
            );
            const value = variable && valueOf(variable);
            const source = writes.find(
              ({ variableId }) => variableId === binding.variableId,
            );
            const choice = choicesByVariableId
              .get(binding.variableId)
              ?.find((candidate) => candidate.value === value);
            if (
              !variable ||
              !matchesNotebookVariable(variable, value) ||
              (source && !choice)
            ) {
              return (
                <NotebookChart
                  block={block}
                  filters={[]}
                  state={{
                    type: "blocked",
                    message:
                      value === undefined
                        ? `Select ${variable?.name ?? "a value"} to view this chart.`
                        : `${variable?.name ?? "Value"} is unavailable.`,
                  }}
                />
              );
            }
            if (portId === "filter" || portId === "timeRange")
              values[portId] = value;
            labels.push(`${variable.name}: ${choice?.label ?? labelOf(value)}`);
          }
          return renderChart(
            block,
            labels.length ? values : undefined,
            labels.length ? labels : undefined,
          );
        }}
      />
    );
  })();
  const documentPanel = (
    <div
      ref={documentScroll}
      className="@container/notebook min-h-0 min-w-0 flex-1 overflow-y-auto"
    >
      <div
        ref={documentBody}
        className={cn(
          wide ? "px-4" : readingColumnClassName,
          layout.kind === "inbox" && "mx-auto w-full max-w-5xl sm:px-6",
          "py-6",
        )}
      >
        {!isLoadingDocument &&
          (metadata?.title || headerProperties.length > 0) && (
            <header className="mb-6 space-y-3">
              {metadata?.title && (
                <h2 className="text-xl font-bold wrap-break-word">
                  {metadata.title}
                </h2>
              )}
              {headerProperties.length > 0 && (
                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {headerProperties.map(({ field, value }) => (
                    <div
                      key={field.id}
                      className="flex min-w-0 flex-wrap items-baseline gap-x-1"
                    >
                      <dt className="text-muted-foreground">{field.label}:</dt>
                      <dd
                        className={cn(
                          "min-w-0 wrap-break-word",
                          field.type === "select" &&
                            !field.options.some(
                              (option) =>
                                typeof option === "object" &&
                                option.value === value &&
                                option.color,
                            ) &&
                            "bg-muted rounded px-1.5 font-medium",
                        )}
                      >
                        {renderProperty(field, value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </header>
          )}
        {presentationWarnings.length > 0 && (
          <aside
            aria-label="Presentation warnings"
            className="text-muted-foreground mb-4 text-sm"
          >
            <ul className="list-disc pl-5">
              {presentationWarnings.map(({ blockId, code, message }) => (
                <li key={`${blockId}:${code}`}>
                  {message} <code>{blockId}</code>
                </li>
              ))}
            </ul>
          </aside>
        )}
        {documentContent}
        {showCreationSkeleton && (
          <div
            role="status"
            aria-label="Notebook is being written"
            className="mt-6 flex max-w-lg flex-col gap-2.5"
          >
            <Skeleton className="h-4 w-1/3 motion-reduce:animate-none" />
            <Skeleton className="h-3 w-full motion-reduce:animate-none" />
            <Skeleton className="h-3 w-3/4 motion-reduce:animate-none" />
          </div>
        )}
      </div>
    </div>
  );
  const notebookContent = (() => {
    if (layout.kind === "default") return documentPanel;
    const availableIds = new Set(documents.map(({ id }) => id));
    if (layout.kind === "tabs") {
      const entries = layout.documents.filter(({ documentId }) =>
        availableIds.has(documentId),
      );
      return (
        <Tabs
          layout="fill"
          value={documentId}
          activationMode="manual"
          onValueChange={(id) => onDocumentChange(id, version)}
        >
          <div className="shrink-0 border-b">
            <div
              className={cn(
                wide ? "px-4" : readingColumnClassName,
                "flex items-center pt-1 pb-2 sm:h-9 sm:py-0",
              )}
            >
              <Tabs.List
                variant="underline"
                aria-label="Notebook documents"
                overflow="menu"
              >
                {entries.map(({ documentId, title, label }) => (
                  <Tabs.Trigger
                    key={documentId}
                    value={documentId}
                    label={title ?? label ?? documentId}
                  />
                ))}
              </Tabs.List>
            </div>
          </div>
          <Tabs.Content value={documentId} layout="fill">
            {documentPanel}
          </Tabs.Content>
        </Tabs>
      );
    }
    const entries = layout.documents.filter(({ documentId }) =>
      availableIds.has(documentId),
    );
    const propertySchema = layout.propertySchema;
    const visibleFields =
      propertySchema?.fields.filter(({ id }) =>
        propertySchema.visibleByDefault?.includes(id),
      ) ?? [];
    const [direction, fieldId] = sort.split(":");
    const sortField = visibleFields.find(({ id }) => id === fieldId);
    if (sortField) {
      const options =
        "options" in sortField
          ? sortField.options.map((option) =>
              typeof option === "string" ? option : option.value,
            )
          : [];
      entries.sort((left, right) => {
        const a = left.properties?.[sortField.id];
        const b = right.properties?.[sortField.id];
        const aMissing = a === undefined || (Array.isArray(a) && !a.length);
        const bMissing = b === undefined || (Array.isArray(b) && !b.length);
        if (aMissing || bMissing) return Number(aMissing) - Number(bMissing);

        let order = 0;
        if (typeof a === "number" && typeof b === "number") {
          order = a - b;
        } else if (typeof a === "boolean" && typeof b === "boolean") {
          order = Number(a) - Number(b);
        } else if (sortField.type === "select") {
          order = options.indexOf(String(a)) - options.indexOf(String(b));
        } else if (
          sortField.type === "multi-select" &&
          Array.isArray(a) &&
          Array.isArray(b)
        ) {
          const aRanks = a
            .map((value) => options.indexOf(value))
            .sort((x, y) => x - y);
          const bRanks = b
            .map((value) => options.indexOf(value))
            .sort((x, y) => x - y);
          for (
            let index = 0;
            index < Math.min(aRanks.length, bRanks.length);
            index++
          ) {
            order = aRanks[index] - bRanks[index];
            if (order !== 0) break;
          }
          if (order === 0) order = aRanks.length - bRanks.length;
        } else {
          order = String(a).localeCompare(String(b));
        }
        return direction === "desc" ? -order : order;
      });
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          aria-label="Notebook documents"
          className="bg-surface max-h-44 shrink-0 overflow-y-auto border-b md:max-h-none md:w-64 md:border-r md:border-b-0"
        >
          {visibleFields.length > 0 && (
            <div className="flex items-center justify-between border-b px-3 py-1">
              <span className="text-muted-foreground text-xs font-medium">
                Documents
              </span>
              <DropdownMenu
                title="Sort by"
                placement="bottom-end"
                items={[
                  {
                    id: "original",
                    type: "item",
                    title: "Original order",
                    icon: sortField ? undefined : Check,
                    onClick: () => setSort(""),
                  },
                  { id: "sort-options", type: "separator" },
                  ...visibleFields.flatMap(({ id, label }) =>
                    (["asc", "desc"] as const).map((order) => {
                      const option = `${order}:${id}`;
                      return {
                        id: option,
                        type: "item" as const,
                        title: `${label} ${order === "asc" ? "ascending" : "descending"}`,
                        icon: sort === option ? Check : undefined,
                        onClick: () => setSort(option),
                      };
                    }),
                  ),
                ]}
              >
                {({ getTriggerProps }) => (
                  <button
                    {...getTriggerProps()}
                    type="button"
                    aria-label="Sort documents"
                    title={
                      sortField
                        ? `Sorted by ${sortField.label}`
                        : "Sort documents"
                    }
                    className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-7 items-center justify-center rounded focus-visible:ring-2 focus-visible:outline-hidden"
                  >
                    <ArrowUpDown size="sm" aria-hidden />
                  </button>
                )}
              </DropdownMenu>
            </div>
          )}
          <ul className="space-y-0.5 p-1.5">
            {entries.map(({ documentId: id, title, label, properties }) => {
              const name = title ?? label ?? id;
              const metadata = visibleFields.flatMap((field) => {
                const displayValue = formatProperty(
                  properties?.[field.id],
                  field.type,
                );
                if (displayValue === undefined) return [];
                return [{ field, value: displayValue }];
              });
              return (
                <li key={id}>
                  <button
                    type="button"
                    aria-current={id === documentId ? "true" : undefined}
                    className="hover:bg-accent/60 focus-visible:ring-ring aria-[current=true]:bg-accent block w-full rounded-md px-2.5 py-2 text-left focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset"
                    onClick={() => {
                      if (id !== documentId) onDocumentChange(id, version);
                    }}
                  >
                    <span
                      className="block truncate text-sm font-medium"
                      title={name}
                    >
                      {name}
                    </span>
                    {metadata.length > 0 && (
                      <span className="text-muted-foreground mt-1 flex min-h-5 items-center gap-2 text-xs">
                        {metadata.map(({ field, value }) => (
                          <span
                            key={field.id}
                            className={cn(
                              "inline-flex min-w-0 items-center gap-1",
                              field.id === "priority" &&
                                "ml-auto max-w-1/2 shrink-0",
                            )}
                            title={`${field.label}: ${value}`}
                          >
                            <span>{field.label}:</span>{" "}
                            <span className="min-w-0 truncate" title={value}>
                              {field.id === "priority"
                                ? renderProperty(field, properties?.[field.id])
                                : value}
                            </span>
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        {documentPanel}
      </div>
    );
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {variablesToolbar}
      {notebookContent}
    </div>
  );
}

function useLiveTableQueries(
  liveTableSnapshot: NonNullable<NotebookReaderProps["liveTableSnapshot"]>,
  liveTableIds: string[],
) {
  return api.useQueries((query) =>
    liveTableSnapshot
      ? liveTableIds.map((blockId) =>
          query.notebooks.liveTable(
            { ...liveTableSnapshot, blockId },
            { refetchInterval: 30_000, meta: { silentAllErrors: true } },
          ),
        )
      : [],
  );
}

type NotebookReaderProps = ComponentProps<typeof NotebookReaderContent> & {
  liveTableSnapshot?: Omit<RouterInput["notebooks"]["liveTable"], "blockId">;
};

export function NotebookReader({
  liveTableSnapshot,
  ...props
}: NotebookReaderProps) {
  const { blocks } = props.view;
  const pendingBlocks = [...blocks];
  const liveTableIds: string[] = [];
  for (const block of pendingBlocks) {
    if (block.schema === "row@1") pendingBlocks.push(...block.props.children);
    if (block.schema === "table@1" && "source" in block.props)
      liveTableIds.push(block.id);
  }
  if (!liveTableSnapshot || !liveTableIds.length || props.isLoadingDocument)
    return <NotebookReaderContent {...props} />;
  return (
    <LiveNotebookReader
      {...props}
      liveTableSnapshot={liveTableSnapshot}
      liveTableIds={liveTableIds}
    />
  );
}

function LiveNotebookReader({
  liveTableSnapshot,
  liveTableIds,
  ...props
}: NotebookReaderProps & {
  liveTableSnapshot: NonNullable<NotebookReaderProps["liveTableSnapshot"]>;
  liveTableIds: string[];
}) {
  const liveQueries = useLiveTableQueries(liveTableSnapshot, liveTableIds);
  return (
    <NotebookReaderContent
      {...props}
      liveTableIds={liveTableIds}
      liveQueries={liveQueries}
    />
  );
}
