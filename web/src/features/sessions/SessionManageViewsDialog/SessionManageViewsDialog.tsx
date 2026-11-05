import { type ComponentProps, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  ArrowUp,
  ArrowDown,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "@langfuse/icons";
import { type RouterOutputs } from "@/src/utils/api";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  Table,
  type AsyncTableData,
} from "@/src/components/design-system/table/Table";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";

type SessionViewRow = ComponentProps<
  typeof SessionManageViewsList
>["views"][number] & {
  isPinned: boolean;
  showEditActions: boolean;
  onTogglePin: () => void;
  onMoveUp: (() => void) | undefined;
  onMoveDown: (() => void) | undefined;
  onEdit: () => void;
  onDelete: () => void;
};

const columns: ColumnDef<SessionViewRow>[] = [
  {
    id: "pinned",
    header: "",
    enableResizing: false,
    size: 40,
    cell: ({ row }) => {
      const view = row.original;
      const { isPinned } = view;
      const pinLabel = `${isPinned ? "Unpin" : "Pin"} ${view.name}`;
      return (
        <Tooltip label={pinLabel}>
          {({ getTriggerProps }) => (
            <IconButton
              icon={isPinned ? PinOff : Pin}
              label={pinLabel}
              disabled={view.isSupported === false}
              {...getTriggerProps({
                onClick: view.onTogglePin,
              })}
            />
          )}
        </Tooltip>
      );
    },
  },
  {
    accessorKey: "name",
    header: "Name",
    enableResizing: false,
    cell: ({ row }) => (
      <span className="block truncate" title={row.original.name}>
        {row.original.name}
        {row.original.isSupported === false && " (unsupported)"}
      </span>
    ),
  },
  createUserTableColumn<SessionViewRow>({
    id: "createdBy",
    accessorFn: (view) => view.createdByUser,
    header: "Created by",
    enableResizing: false,
    variant: "avatar",
    emptyValue: "Unknown user",
    nullValue: "Built-in",
    getUser: (user, { row }) => {
      if (row.original.id === "messages") return undefined;
      return { type: "user", user: user ?? {} };
    },
  }),
  {
    id: "actions",
    header: "",
    headerClassName: "text-right",
    cellClassName: "text-right",
    enableResizing: false,
    size: 160,
    cell: ({ row }) => {
      const view = row.original;
      return (
        <div className="flex w-full items-center justify-end gap-2">
          <IconButton
            icon={ArrowUp}
            label={`Move ${view.name} up`}
            disabled={!view.onMoveUp}
            onClick={view.onMoveUp}
          />
          <IconButton
            icon={ArrowDown}
            label={`Move ${view.name} down`}
            disabled={!view.onMoveDown}
            onClick={view.onMoveDown}
          />
          {view.showEditActions && (
            <>
              <IconButton
                icon={Pencil}
                label={`Edit ${view.name}`}
                disabled={!view.canEdit || view.isSupported === false}
                onClick={view.onEdit}
              />
              <IconButton
                icon={Trash2}
                label={`Delete ${view.name}`}
                disabled={!view.canEdit}
                onClick={view.onDelete}
              />
            </>
          )}
        </div>
      );
    },
  },
];

function SessionManageViewsList({
  views,
  currentUserId,
  unpinnedViewIds,
  canEdit,
  isLoading,
  error,
  onPin,
  onUnpin,
  onEdit,
  onDelete,
  onMove,
}: {
  views: (Pick<
    RouterOutputs["sessionViews"]["list"][number],
    "id" | "name" | "canEdit"
  > &
    Partial<
      Pick<
        RouterOutputs["sessionViews"]["list"][number],
        "createdBy" | "createdByUser" | "isSupported"
      >
    >)[];
  currentUserId: string | undefined;
  unpinnedViewIds: string[];
  canEdit: boolean;
  isLoading: boolean;
  error: string | undefined;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
}) {
  const [tab, setTab] = useState("all");
  const reorderableViews = views.filter(
    (view) =>
      view.isSupported !== false &&
      view.id !== "messages" &&
      !unpinnedViewIds.includes(view.id),
  );

  const filteredViews = views
    .filter((view) => {
      if (tab === "all") return true;
      if (view.id === "messages" || !currentUserId) return false;
      if (tab === "mine") return view.createdBy === currentUserId;
      return view.createdBy !== currentUserId;
    })
    .sort(
      (left, right) =>
        Number(unpinnedViewIds.includes(left.id)) -
        Number(unpinnedViewIds.includes(right.id)),
    );
  const data = ((): AsyncTableData<SessionViewRow[]> => {
    if (isLoading) return { status: "loading" };
    if (error) return { status: "error", error };
    return {
      status: "success",
      data: filteredViews.map((view) => {
        const isPinned =
          view.isSupported !== false && !unpinnedViewIds.includes(view.id);
        const index = reorderableViews.findIndex(
          (candidate) => candidate.id === view.id,
        );
        return {
          ...view,
          isPinned,
          showEditActions: canEdit || view.id === "messages",
          onTogglePin: () => (isPinned ? onUnpin(view.id) : onPin(view.id)),
          onMoveUp: index > 0 ? () => onMove(view.id, "up") : undefined,
          onMoveDown:
            index >= 0 && index < reorderableViews.length - 1
              ? () => onMove(view.id, "down")
              : undefined,
          onEdit: () => onEdit(view.id),
          onDelete: () => onDelete(view.id),
        };
      }),
    };
  })();
  const noResultsMessage = (() => {
    if (tab === "mine") return "You haven’t created any views yet.";
    if (tab === "others") return "No views from other people yet.";
    return "No saved views yet.";
  })();
  return (
    <div className="flex flex-col gap-2">
      <Tabs value={tab} onValueChange={setTab}>
        <Tabs.List variant="inset" size="md">
          <Tabs.Trigger value="all" label="All views" />
          <Tabs.Trigger value="mine" label="My views" />
          <Tabs.Trigger value="others" label="Others’ views" />
        </Tabs.List>
      </Tabs>
      <div className="overflow-hidden rounded-md border">
        <Table
          tableName="Session views"
          data={data}
          noResultsMessage={noResultsMessage}
          columns={columns}
          topBorder={false}
        />
      </div>
    </div>
  );
}

export function SessionManageViewsDialog({
  views,
  currentUserId,
  canEdit,
  isLoading,
  error,
  unpinnedViewIds,
  viewOrder,
  onReorder,
  onPin,
  onUnpin,
  onEditView,
  onDeleteView,
}: {
  views: ComponentProps<typeof SessionManageViewsList>["views"];
  currentUserId: string | undefined;
  canEdit: boolean;
  isLoading: boolean;
  error: string | undefined;
  unpinnedViewIds: string[];
  viewOrder: string[];
  onReorder: (ids: string[]) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onEditView: (id: string) => void;
  onDeleteView: (id: string) => void;
}) {
  const customViews = [...views].sort((left, right) => {
    const leftIndex = viewOrder.indexOf(left.id);
    const rightIndex = viewOrder.indexOf(right.id);
    return (
      (leftIndex < 0 ? Infinity : leftIndex) -
      (rightIndex < 0 ? Infinity : rightIndex)
    );
  });
  return (
    <Dialog title="Manage views" closeLabel="Done" size="md">
      <Dialog.Body>
        <SessionManageViewsList
          currentUserId={currentUserId}
          views={[
            { id: "messages", name: "Messages", canEdit: false },
            ...customViews,
          ]}
          unpinnedViewIds={unpinnedViewIds}
          canEdit={canEdit}
          isLoading={isLoading}
          error={error}
          onPin={onPin}
          onUnpin={onUnpin}
          onMove={(id, direction) => {
            const ids = customViews
              .filter((view) => !unpinnedViewIds.includes(view.id))
              .map((view) => view.id);
            const index = ids.indexOf(id);
            const target = direction === "up" ? index - 1 : index + 1;
            if (index < 0 || target < 0 || target >= ids.length) return;
            ids.splice(index, 1);
            ids.splice(target, 0, id);
            onReorder([
              ...ids,
              ...customViews
                .filter((view) => unpinnedViewIds.includes(view.id))
                .map((view) => view.id),
            ]);
          }}
          onEdit={(id) => {
            const view = customViews.find((view) => view.id === id);
            if (
              !view ||
              view.isSupported === false ||
              !canEdit ||
              !view.canEdit
            )
              return;
            onEditView(id);
          }}
          onDelete={(id) => {
            const view = customViews.find((view) => view.id === id);
            if (!view || !canEdit || !view.canEdit) return;
            onDeleteView(id);
          }}
        />
      </Dialog.Body>
    </Dialog>
  );
}
