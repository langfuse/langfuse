import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, Route } from "lucide-react";
import { SiAnthropic, SiOpenai } from "react-icons/si";

import Header from "@/src/components/layouts/header";
import { DataTable } from "@/src/components/table/data-table";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { TableRow } from "@/src/components/ui/table";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type {
  GatewayConnection,
  GatewayProvider,
} from "@/src/features/ai-gateway/types/gatewayProvider";
import { cn } from "@/src/utils/tailwind";

const TABLE_NAME = "gateway-provider-credentials";

export function reorderProviderIds(
  ids: string[],
  sourceId: string,
  targetId: string,
) {
  const sourceIndex = ids.indexOf(sourceId);
  const targetIndex = ids.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return ids;
  }

  const nextIds = [...ids];
  const [movedId] = nextIds.splice(sourceIndex, 1);
  if (!movedId) return ids;
  nextIds.splice(targetIndex, 0, movedId);
  return nextIds;
}

type SortableHandleContextValue = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "listeners"
>;
const SortableHandleContext = createContext<SortableHandleContextValue | null>(
  null,
);

export type GatewayConnectionRow = GatewayConnection;

export function GatewayProvidersView({
  connections,
  modelCounts,
  createAction,
  renderCredentialActions,
  hasMore,
  isLoadingMore,
  onLoadMore,
  canReorder,
  onReorder,
}: {
  connections: GatewayConnectionRow[];
  modelCounts: Record<string, number | "loading">;
  createAction: ReactNode;
  renderCredentialActions: (
    connection: GatewayConnectionRow,
    index: number,
  ) => ReactNode;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => unknown;
  canReorder: boolean;
  onReorder: (sourceId: string, targetId: string) => Promise<boolean>;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );
  const serverOrderKey = JSON.stringify(
    connections.map((connection) => connection.id),
  );
  const serverIds = useMemo<string[]>(
    () => JSON.parse(serverOrderKey),
    [serverOrderKey],
  );
  const [orderedIds, setOrderedIds] = useState(serverIds);
  const rowNodes = useRef(new Map<string, HTMLTableRowElement>());
  const pendingRowPositions = useRef<Map<string, number> | null>(null);

  const captureRowPositions = useCallback(
    () =>
      new Map(
        [...rowNodes.current].map(([id, node]) => [
          id,
          node.getBoundingClientRect().top,
        ]),
      ),
    [],
  );
  const registerRowNode = useCallback(
    (id: string, node: HTMLTableRowElement | null) => {
      if (node) rowNodes.current.set(id, node);
      else rowNodes.current.delete(id);
    },
    [],
  );

  useEffect(() => {
    setOrderedIds(serverIds);
  }, [serverIds]);

  useLayoutEffect(() => {
    const previousPositions = pendingRowPositions.current;
    if (!previousPositions) return;
    pendingRowPositions.current = null;

    for (const [id, node] of rowNodes.current) {
      const previousTop = previousPositions.get(id);
      if (previousTop === undefined) continue;
      const offset = previousTop - node.getBoundingClientRect().top;
      if (offset === 0) continue;

      node.animate(
        [
          { transform: `translateY(${offset}px)` },
          { transform: "translateY(0)" },
        ],
        { duration: 200, easing: "ease" },
      );
    }
  }, [orderedIds]);

  const orderedConnections = useMemo(() => {
    const orderById = new Map(
      orderedIds.map((connectionId, index) => [connectionId, index]),
    );
    return connections.toSorted(
      (left, right) =>
        (orderById.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (orderById.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [connections, orderedIds]);

  const moveConnection = useCallback(
    async (sourceId: string, targetId: string, animateRows = false) => {
      const previousIds = orderedIds;
      const nextIds = reorderProviderIds(previousIds, sourceId, targetId);
      if (nextIds === previousIds) return;

      if (animateRows) pendingRowPositions.current = captureRowPositions();
      setOrderedIds(nextIds);

      if (!(await onReorder(sourceId, targetId))) {
        if (animateRows) pendingRowPositions.current = captureRowPositions();
        setOrderedIds(previousIds);
      }
    },
    [captureRowPositions, onReorder, orderedIds],
  );
  const columns = useMemo<LangfuseColumnDef<GatewayConnectionRow, unknown>[]>(
    () => [
      {
        accessorKey: "priority",
        id: "priority",
        header: "Priority",
        size: 180,
        cell: ({ row }) => (
          <ProviderPriorityCell
            connection={row.original}
            index={row.index}
            connectionCount={orderedConnections.length}
            canReorder={canReorder}
            onMove={async (targetIndex) => {
              const target = orderedConnections[targetIndex];
              if (target)
                await moveConnection(row.original.id, target.id, true);
            }}
          />
        ),
      },
      {
        accessorKey: "provider",
        id: "provider",
        header: "Provider",
        size: 220,
        cell: ({ row }) => <ProviderName provider={row.original.provider} />,
      },
      {
        accessorKey: "name",
        id: "name",
        header: "Name",
        size: 220,
        isFlexWidth: true,
      },
      {
        accessorKey: "displaySecret",
        id: "displaySecret",
        header: "Credential",
        size: 220,
        cell: ({ row }) => (
          <span className="font-mono">{row.original.displaySecret}</span>
        ),
      },
      {
        accessorKey: "status",
        id: "status",
        header: "Status",
        size: 120,
        cell: ({ row }) => <ConnectionStatus status={row.original.status} />,
      },
      {
        accessorKey: "models",
        id: "models",
        header: "Models",
        size: 180,
        cell: ({ row }) => <ModelCount value={modelCounts[row.original.id]} />,
      },
      {
        accessorKey: "actions",
        id: "actions",
        header: "Actions",
        size: 180,
        enableResizing: false,
        isFixedPosition: true,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {renderCredentialActions(row.original, row.index)}
          </div>
        ),
      },
    ],
    [
      canReorder,
      modelCounts,
      moveConnection,
      orderedConnections,
      renderCredentialActions,
    ],
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const reorder = getProviderReorder(event, canReorder);
    if (reorder) await moveConnection(reorder.sourceId, reorder.targetId);
  };

  return (
    <div className="flex flex-col gap-4">
      <Header title="Provider credentials" actionButtons={createAction} />
      <p className="text-muted-foreground text-sm">
        Requests use the first compatible enabled credential in routing priority
        order. Credentials are validated against the provider when they are
        saved.
      </p>

      <DndContext
        autoScroll={false}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        sensors={sensors}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={orderedConnections.map((connection) => connection.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="overflow-hidden rounded-md border">
            <DataTable
              tableName={TABLE_NAME}
              columns={columns}
              data={{
                isLoading: false,
                isError: false,
                data: orderedConnections,
              }}
              hidePagination
              cellPadding="comfortable"
              noResultsMessage="No provider credentials configured."
              renderRow={({ row, children }) => (
                <SortableProviderRow
                  connection={row.original}
                  canReorder={canReorder}
                  registerRowNode={registerRowNode}
                >
                  {children}
                </SortableProviderRow>
              )}
            />
          </div>
        </SortableContext>
      </DndContext>

      {hasMore ? (
        <Button
          className="self-center"
          variant="secondary"
          loading={isLoadingMore}
          disabled={isLoadingMore}
          aria-label="Load more"
          onClick={() => {
            onLoadMore();
          }}
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}

export function getProviderReorder(
  event: Pick<DragEndEvent, "active" | "over">,
  canReorder: boolean,
) {
  if (
    !canReorder ||
    !event.over ||
    event.active.id === event.over.id ||
    typeof event.active.id !== "string" ||
    typeof event.over.id !== "string"
  ) {
    return null;
  }

  return { sourceId: event.active.id, targetId: event.over.id };
}

function SortableProviderRow({
  connection,
  canReorder,
  registerRowNode,
  children,
}: {
  connection: GatewayConnectionRow;
  canReorder: boolean;
  registerRowNode: (id: string, node: HTMLTableRowElement | null) => void;
  children: ReactNode;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: connection.id,
    disabled: !canReorder,
  });
  const handleNodeRef = useCallback(
    (node: HTMLTableRowElement | null) => {
      setNodeRef(node);
      registerRowNode(connection.id, node);
    },
    [connection.id, registerRowNode, setNodeRef],
  );
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : undefined,
    position: isDragging ? "relative" : undefined,
  };

  return (
    <SortableHandleContext.Provider value={{ attributes, listeners }}>
      <TableRow
        ref={handleNodeRef}
        style={style}
        className={cn(
          "ph-no-capture group hover:bg-accent cursor-default",
          isDragging && "bg-muted z-10 opacity-70 shadow-sm",
        )}
      >
        {children}
      </TableRow>
    </SortableHandleContext.Provider>
  );
}

function ProviderPriorityCell({
  connection,
  index,
  connectionCount,
  canReorder,
  onMove,
}: {
  connection: GatewayConnectionRow;
  index: number;
  connectionCount: number;
  canReorder: boolean;
  onMove: (targetIndex: number) => Promise<void>;
}) {
  const sortableHandle = useContext(SortableHandleContext);

  return (
    <div className="flex h-7 items-center gap-1">
      <button
        {...sortableHandle?.attributes}
        {...sortableHandle?.listeners}
        type="button"
        disabled={!sortableHandle}
        aria-label={`Drag ${connection.name} to reorder`}
        className="text-muted-foreground flex size-6 shrink-0 cursor-grab touch-none items-center justify-center p-0 opacity-50 hover:opacity-100 active:cursor-grabbing disabled:cursor-not-allowed"
      >
        <GripVertical className="size-3.5" />
      </button>
      <span className="flex size-6 shrink-0 translate-y-px items-center justify-center font-mono leading-none">
        {index + 1}
      </span>
      <div className="flex h-6 items-center opacity-40 transition-opacity group-hover:opacity-100">
        <Button
          size="icon-xs"
          variant="ghost"
          className="text-muted-foreground size-6 opacity-60 hover:opacity-100"
          disabled={!canReorder || index === 0}
          aria-label="Move credential up"
          onClick={() => onMove(index - 1)}
        >
          <ArrowUp className="size-3" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          className="text-muted-foreground size-6 opacity-60 hover:opacity-100"
          disabled={!canReorder || index === connectionCount - 1}
          aria-label="Move credential down"
          onClick={() => onMove(index + 1)}
        >
          <ArrowDown className="size-3" />
        </Button>
      </div>
    </div>
  );
}

function ModelCount({ value }: { value: number | "loading" | undefined }) {
  if (value === "loading") return <>Loading…</>;
  if (value === undefined) return <>—</>;
  return (
    <>
      {value} {value === 1 ? "model" : "models"} available
    </>
  );
}

function ProviderName({ provider }: { provider: GatewayProvider }) {
  const icon =
    provider === "OPENAI" ? (
      <SiOpenai className="size-4" aria-hidden="true" />
    ) : provider === "ANTHROPIC" ? (
      <SiAnthropic className="size-4" aria-hidden="true" />
    ) : (
      <Route className="size-4" aria-hidden="true" />
    );

  return (
    <div className="flex items-center gap-2">
      <span className="bg-muted flex size-7 items-center justify-center rounded-md border">
        {icon}
      </span>
      <span>{providerLabels[provider]}</span>
    </div>
  );
}

function ConnectionStatus({
  status,
}: {
  status: GatewayConnectionRow["status"];
}) {
  const variant =
    status === "ENABLED"
      ? "success"
      : status === "ERROR"
        ? "error"
        : "secondary";
  return <Badge variant={variant}>{status.toLowerCase()}</Badge>;
}
