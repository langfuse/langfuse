import { type RouterOutputs } from "@/src/utils/api";
import { type ComponentProps, useMemo, useState } from "react";
import { type FilterState } from "@langfuse/shared";
import { ChevronRight, MoreHorizontal } from "@langfuse/icons";
import { type LangfuseItemType } from "@/src/components/ItemBadge";
import { VirtualizedTree } from "@/src/features/traces/components/VirtualizedTree";
import { VirtualizedTreeNodeWrapper } from "@/src/features/traces/components/VirtualizedTreeNodeWrapper";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";

type PreviewNode = Pick<
  RouterOutputs["sessions"]["previewTree"][number],
  "name"
> & {
  id: string;
  matches: boolean;
  type: LangfuseItemType;
  column: "name" | "traceName";
  children: PreviewNode[];
};

function PreviewRow({
  name,
  matches,
  column,
  disabled,
  onFilter,
}: {
  name: string | null;
  matches: boolean;
  column: "name" | "traceName";
  disabled: boolean;
  onFilter: (filter: FilterState[number]) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 py-1">
      <span
        className={matches ? "truncate" : "truncate opacity-35"}
        title={name ?? "Unnamed"}
      >
        {column === "traceName" ? "Trace: " : ""}
        {name ?? "Unnamed"}
      </span>
      {!matches ? <span className="sr-only">Excluded by filters</span> : null}
      <DropdownMenu
        disabled={disabled || name === null}
        placement="bottom-end"
        items={[
          {
            id: "include-by-name",
            type: "item",
            title: "Include by name",
            onClick: () => {
              if (name !== null)
                onFilter({
                  column,
                  type: "string",
                  operator: "=",
                  value: name,
                });
            },
          },
          {
            id: "exclude-by-name",
            type: "item",
            title: "Exclude by name",
            onClick: () => {
              if (name !== null)
                onFilter({
                  column,
                  type: "stringOptions",
                  operator: "none of",
                  value: [name],
                });
            },
          },
        ]}
      >
        {({ getTriggerProps }) => (
          <button
            type="button"
            disabled={disabled || name === null}
            aria-label={`Filter ${column === "traceName" ? "trace" : "observation"} ${name ?? "Unnamed"}`}
            className="ml-auto shrink-0 rounded px-2"
            {...getTriggerProps({
              onClick: (event) => event.stopPropagation(),
            })}
          >
            <MoreHorizontal size="sm" aria-hidden="true" />
          </button>
        )}
      </DropdownMenu>
    </div>
  );
}

type PreviewNodeRenderProps = Parameters<
  ComponentProps<typeof VirtualizedTree<PreviewNode>>["renderNode"]
>[0] &
  Pick<ComponentProps<typeof PreviewRow>, "disabled" | "onFilter">;

function TracePreviewHeader({
  node,
  isCollapsed,
  onToggleCollapse,
  disabled,
  onFilter,
  isFirst,
}: PreviewNodeRenderProps & { isFirst: boolean }) {
  const collapseLabel = isCollapsed ? "Expand" : "Collapse";
  return (
    <header className={isFirst ? "" : "pt-2"}>
      <h4 className="bg-muted/50 hover:bg-accent dark:text-muted-foreground flex min-w-0 items-center rounded pl-2 text-xs">
        <PreviewRow
          name={node.name}
          matches={node.matches}
          column="traceName"
          disabled={disabled}
          onFilter={onFilter}
        />
        <div className="flex w-7 shrink-0 justify-end pr-1">
          {node.children.length > 0 && (
            <button
              type="button"
              aria-label={`${collapseLabel} trace ${node.name ?? "Unnamed"}`}
              aria-expanded={!isCollapsed}
              onClick={onToggleCollapse}
              className="text-muted-foreground hover:text-foreground hover:bg-primary/10 focus-visible:ring-ring inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
            >
              <span
                className={
                  isCollapsed ? "inline-flex" : "inline-flex rotate-90"
                }
              >
                <ChevronRight size="base" />
              </span>
            </button>
          )}
        </div>
      </h4>
    </header>
  );
}

function ObservationPreviewRow({
  node,
  treeMetadata,
  isCollapsed,
  onToggleCollapse,
  onSelect,
  disabled,
  onFilter,
}: PreviewNodeRenderProps) {
  return (
    <div role="group" aria-label={`Observation ${node.name ?? "Unnamed"}`}>
      <VirtualizedTreeNodeWrapper
        className="rounded-md [&_[data-expand-button]>span]:inline-flex [&_[data-expand-button]>span]:items-center [&_[data-expand-button]>span]:justify-center"
        metadata={{
          ...treeMetadata,
          depth: treeMetadata.depth - 1,
          treeLines: treeMetadata.treeLines.slice(1),
        }}
        nodeType={node.type}
        hasChildren={node.children.length > 0}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        isSelected={false}
        onSelect={onSelect}
      >
        <PreviewRow
          name={node.name}
          matches={node.matches}
          column="name"
          disabled={disabled}
          onFilter={onFilter}
        />
      </VirtualizedTreeNodeWrapper>
    </div>
  );
}

export function SessionFilterPreview({
  traces,
  pending,
  error,
  invalid,
  onFilter,
}: {
  traces:
    | Array<
        Pick<
          RouterOutputs["sessions"]["previewTree"][number],
          "id" | "name" | "truncated"
        > & {
          matches: boolean;
          observations: Array<
            RouterOutputs["sessions"]["previewTree"][number]["observations"][number] & {
              matches: boolean;
            }
          >;
        }
      >
    | undefined;
  pending: boolean;
  error: string | undefined;
  invalid: boolean;
  onFilter: (filter: FilterState[number]) => void;
}) {
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(
    () => new Set(),
  );
  const roots = useMemo(
    () =>
      (traces ?? []).map((trace) => {
        const root: PreviewNode = {
          id: `trace:${trace.id}`,
          name: trace.name,
          matches: trace.matches,
          type: "TRACE",
          column: "traceName",
          children: [],
        };
        const observationsById = new Map(
          trace.observations.map((observation) => [
            observation.id,
            observation,
          ]),
        );
        const children = new Map<string | null, typeof trace.observations>();
        for (const observation of trace.observations) {
          const parentId =
            observation.parentObservationId &&
            observationsById.has(observation.parentObservationId)
              ? observation.parentObservationId
              : null;
          const siblings = children.get(parentId) ?? [];
          siblings.push(observation);
          children.set(parentId, siblings);
        }
        const visited = new Set<string>();
        const visit = (
          observation: (typeof trace.observations)[number],
          parent: PreviewNode,
        ) => {
          if (visited.has(observation.id)) return;
          visited.add(observation.id);
          const node: PreviewNode = {
            id: `trace:${trace.id}:observation:${observation.id}`,
            name: observation.name,
            matches: observation.matches,
            type: observation.type,
            column: "name",
            children: [],
          };
          parent.children.push(node);
          for (const child of children.get(observation.id) ?? [])
            visit(child, node);
        };
        for (const observation of children.get(null) ?? [])
          visit(observation, root);
        // Keep orphaned and cyclic observations visible without creating a cyclic tree.
        for (const observation of trace.observations) visit(observation, root);
        return root;
      }),
    [traces],
  );
  const toggleCollapsed = (id: string) =>
    setCollapsedNodes((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <section
      aria-label="Filter preview"
      className="ph-no-capture bg-muted/30 flex min-h-0 min-w-0 flex-col border-t md:overflow-hidden md:border-t-0 md:border-l"
    >
      <header className="bg-modal sticky top-0 z-10 shrink-0 border-b p-4">
        <h3 className="font-bold">Filter preview</h3>
        <p className="text-muted-foreground text-xs">
          Previewing the first 5 traces, with up to 200 observations per trace.
          Observations that don’t match your filters are dimmed.
        </p>
      </header>
      <div
        className="flex h-[45vh] min-h-40 flex-col md:h-auto md:min-h-0 md:flex-1"
        aria-busy={pending}
      >
        {pending || error || traces?.length === 0 ? (
          <div className="space-y-2 p-4">
            {pending ? <p role="status">Updating preview…</p> : null}
            {error ? <p role="alert">{error}</p> : null}
            {!pending && !error && traces?.length === 0 ? (
              <p>No traces to preview.</p>
            ) : null}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 px-2">
          <VirtualizedTree
            roots={roots}
            collapsedNodes={collapsedNodes}
            selectedNodeId={null}
            onToggleCollapse={toggleCollapsed}
            onSelectNode={(id) => {
              if (id !== null) toggleCollapsed(id);
            }}
            renderNode={(props) => {
              if (props.node.column === "traceName") {
                return (
                  <TracePreviewHeader
                    {...props}
                    isFirst={props.node.id === roots[0]?.id}
                    disabled={invalid || pending}
                    onFilter={onFilter}
                  />
                );
              }
              return (
                <ObservationPreviewRow
                  {...props}
                  disabled={invalid || pending}
                  onFilter={onFilter}
                />
              );
            }}
          />
        </div>
      </div>
    </section>
  );
}
