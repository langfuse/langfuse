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
import { type DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
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
  onSetDefaultPin: (() => void) | undefined;
};

const columns: ColumnDef<SessionViewRow>[] = [
  {
    id: "pinned",
    header: "For me",
    sensitive: true,
    enableResizing: false,
    size: 80,
    cell: ({ row }) => {
      const view = row.original;
      const { isPinned } = view;
      const pinLabel = `${isPinned ? "Unpin" : "Pin"} ${view.name}`;
      return (
        <Tooltip label={isPinned ? "Unpin for me" : "Pin for me"}>
          {({ getTriggerProps }) => (
            <IconButton
              icon={isPinned ? PinOff : Pin}
              label={pinLabel}
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
    sensitive: true,
    enableResizing: false,
    cell: ({ row }) => (
      <span className="block truncate" title={row.original.name}>
        {row.original.name}
        {row.original.isPinnedByDefaultForProject && (
          <span className="text-muted-foreground block text-xs">
            Pinned by default
          </span>
        )}
      </span>
    ),
  },
  createUserTableColumn<SessionViewRow>({
    id: "createdBy",
    accessorFn: (view) => view.createdByUser,
    header: "Created by",
    enableResizing: false,
    hideBelowMd: true,
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
    sensitive: true,
    headerClassName: "text-right",
    cellClassName: "text-right",
    enableResizing: false,
    hideBelowMd: true,
    size: 160,
    cell: ({ row }) => {
      const view = row.original;
      return (
        <div className="flex w-full items-center justify-end gap-2">
          {view.onSetDefaultPin && (
            <Tooltip
              label={
                view.isPinnedByDefaultForProject
                  ? "Remove the default pin for this project.\nPersonal pin choices are kept."
                  : "Pin by default for everyone in this project.\nPersonal pin choices are kept."
              }
            >
              {({ getTriggerProps }) => (
                <IconButton
                  icon={view.isPinnedByDefaultForProject ? PinOff : Pin}
                  label={
                    view.isPinnedByDefaultForProject
                      ? `Remove default pin for ${view.name}`
                      : `Pin ${view.name} by default`
                  }
                  {...getTriggerProps({ onClick: view.onSetDefaultPin })}
                />
              )}
            </Tooltip>
          )}
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
                disabled={!view.canEdit}
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

/** The inline action column's actions, as a menu for screens where it is hidden. */
function getViewActions(
  view: SessionViewRow,
): ComponentProps<typeof DropdownMenu>["items"] {
  return [
    ...(view.onSetDefaultPin
      ? [
          {
            type: "item" as const,
            id: "default-pin",
            title: view.isPinnedByDefaultForProject
              ? "Remove default pin"
              : "Pin by default",
            icon: view.isPinnedByDefaultForProject ? PinOff : Pin,
            onClick: view.onSetDefaultPin,
          },
        ]
      : []),
    ...(view.onMoveUp
      ? [
          {
            type: "item" as const,
            id: "move-up",
            title: "Move up",
            icon: ArrowUp,
            onClick: view.onMoveUp,
          },
        ]
      : []),
    ...(view.onMoveDown
      ? [
          {
            type: "item" as const,
            id: "move-down",
            title: "Move down",
            icon: ArrowDown,
            onClick: view.onMoveDown,
          },
        ]
      : []),
    ...(view.showEditActions && view.id !== "messages"
      ? [
          {
            type: "item" as const,
            id: "edit",
            title: "Edit",
            icon: Pencil,
            disabled: !view.canEdit
              ? { reason: "Only the creator can edit this view." }
              : undefined,
            onClick: view.onEdit,
          },
          {
            type: "item" as const,
            id: "delete",
            title: "Delete",
            icon: Trash2,
            variant: "destructive" as const,
            disabled: !view.canEdit
              ? { reason: "Only the creator can delete this view." }
              : undefined,
            onClick: view.onDelete,
          },
        ]
      : []),
  ];
}

function SessionManageViewsList({
  views,
  currentUserId,
  pinnedViewIds,
  canEdit,
  isLoading,
  error,
  onPin,
  onUnpin,
  onEdit,
  onDelete,
  onMove,
  onSetDefaultPin,
}: {
  views: (Pick<
    RouterOutputs["sessionViews"]["list"][number],
    "id" | "name" | "canEdit"
  > &
    Partial<
      Pick<
        RouterOutputs["sessionViews"]["list"][number],
        "createdBy" | "createdByUser" | "isPinnedByDefaultForProject"
      >
    >)[];
  currentUserId: string | undefined;
  pinnedViewIds: string[];
  canEdit: boolean;
  isLoading: boolean;
  error: string | undefined;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onSetDefaultPin?: (id: string, isPinnedByDefaultForProject: boolean) => void;
}) {
  const [tab, setTab] = useState("all");
  const reorderableViews = views.filter(
    (view) => view.id !== "messages" && pinnedViewIds.includes(view.id),
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
        Number(pinnedViewIds.includes(right.id)) -
        Number(pinnedViewIds.includes(left.id)),
    );
  const data = ((): AsyncTableData<SessionViewRow[]> => {
    if (isLoading) return { status: "loading" };
    if (error) return { status: "error", error };
    return {
      status: "success",
      data: filteredViews.map((view) => {
        const isPinned = pinnedViewIds.includes(view.id);
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
          onSetDefaultPin:
            view.id !== "messages" && onSetDefaultPin
              ? () =>
                  onSetDefaultPin(view.id, !view.isPinnedByDefaultForProject)
              : undefined,
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
    <div className="flex min-h-[min(24rem,50dvh)] flex-col gap-2">
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
          actions={getViewActions}
          actionsVisibility="belowMd"
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
  pinnedViewIds,
  onReorder,
  onPin,
  onUnpin,
  onEditView,
  onDeleteView,
  onSetDefaultPin,
}: {
  views: ComponentProps<typeof SessionManageViewsList>["views"];
  currentUserId: string | undefined;
  canEdit: boolean;
  isLoading: boolean;
  error: string | undefined;
  pinnedViewIds: string[];
  onReorder: (ids: string[]) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onEditView: (id: string) => void;
  onDeleteView: (id: string) => void;
  onSetDefaultPin?: (id: string, isPinnedByDefaultForProject: boolean) => void;
}) {
  const customViews = [...views].sort((left, right) => {
    const leftIndex = pinnedViewIds.indexOf(left.id);
    const rightIndex = pinnedViewIds.indexOf(right.id);
    return (
      (leftIndex < 0 ? Infinity : leftIndex) -
      (rightIndex < 0 ? Infinity : rightIndex)
    );
  });
  return (
    <Dialog title="Manage views" closeLabel="Done" size="lg">
      <Dialog.Body>
        <SessionManageViewsList
          currentUserId={currentUserId}
          views={[
            { id: "messages", name: "Messages", canEdit: false },
            ...customViews,
          ]}
          pinnedViewIds={pinnedViewIds}
          canEdit={canEdit}
          isLoading={isLoading}
          error={error}
          onPin={onPin}
          onUnpin={onUnpin}
          onSetDefaultPin={onSetDefaultPin}
          onMove={(id, direction) => {
            const ids = customViews
              .filter((view) => pinnedViewIds.includes(view.id))
              .map((view) => view.id);
            const index = ids.indexOf(id);
            const target = direction === "up" ? index - 1 : index + 1;
            if (index < 0 || target < 0 || target >= ids.length) return;
            ids.splice(index, 1);
            ids.splice(target, 0, id);
            let customIndex = 0;
            onReorder(
              pinnedViewIds.map((viewId) =>
                ids.includes(viewId) ? ids[customIndex++]! : viewId,
              ),
            );
          }}
          onEdit={(id) => {
            const view = customViews.find((view) => view.id === id);
            if (!view || !canEdit || !view.canEdit) return;
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
