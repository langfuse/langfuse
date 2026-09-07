import {
  createContext,
  useContext,
  useMemo,
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
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  defaultAnimateLayoutChanges,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Route } from "lucide-react";
import { SiAnthropic, SiOpenai } from "react-icons/si";

import Header from "@/src/components/layouts/header";
import { DataTable } from "@/src/components/table/data-table";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { TableRow } from "@/src/components/ui/table";
import { providerLabels } from "@/src/features/llm-gateway/constants/providerLabels";
import type { GatewayProvider } from "@/src/features/llm-gateway/types/gatewayProvider";
import { cn } from "@/src/utils/tailwind";

const TABLE_NAME = "gateway-provider-credentials";

export function hasProviderPositionChanged(
  id: string | number,
  previousItems: Array<string | number>,
  items: Array<string | number>,
) {
  return previousItems.indexOf(id) !== items.indexOf(id);
}

const animateProviderLayoutChanges: typeof defaultAnimateLayoutChanges = (
  args,
) =>
  args.previousItems !== args.items
    ? hasProviderPositionChanged(args.id, args.previousItems, args.items)
    : defaultAnimateLayoutChanges(args);

type SortableHandleContextValue = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "listeners"
>;
const SortableHandleContext = createContext<SortableHandleContextValue | null>(
  null,
);

export type GatewayConnectionRow = {
  id: string;
  name: string;
  provider: GatewayProvider;
  displaySecret: string;
  status: "ENABLED" | "DISABLED" | "ERROR";
};

export function GatewayProvidersView({
  connections,
  modelCounts,
  createAction,
  renderPriorityActions,
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
  renderPriorityActions: (
    connection: GatewayConnectionRow,
    index: number,
  ) => ReactNode;
  renderCredentialActions: (
    connection: GatewayConnectionRow,
    index: number,
  ) => ReactNode;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => unknown;
  canReorder: boolean;
  onReorder: (sourceId: string, targetId: string) => unknown;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
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
            priorityActions={renderPriorityActions(row.original, row.index)}
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
    [modelCounts, renderCredentialActions, renderPriorityActions],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const reorder = getProviderReorder(event, canReorder);
    if (reorder) onReorder(reorder.sourceId, reorder.targetId);
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
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        sensors={sensors}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={connections.map((connection) => connection.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="overflow-hidden rounded-md border">
            <DataTable
              tableName={TABLE_NAME}
              columns={columns}
              data={{ isLoading: false, isError: false, data: connections }}
              hidePagination
              cellPadding="comfortable"
              noResultsMessage="No provider credentials configured."
              renderRow={({ row, children }) => (
                <SortableProviderRow
                  connection={row.original}
                  canReorder={canReorder}
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
  children,
}: {
  connection: GatewayConnectionRow;
  canReorder: boolean;
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
    animateLayoutChanges: animateProviderLayoutChanges,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : undefined,
    position: isDragging ? "relative" : undefined,
  };

  return (
    <SortableHandleContext.Provider value={{ attributes, listeners }}>
      <TableRow
        ref={setNodeRef}
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
  priorityActions,
}: {
  connection: GatewayConnectionRow;
  index: number;
  priorityActions: ReactNode;
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
        {priorityActions}
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
