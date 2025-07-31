import type { LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import type { RouterOutput } from "@/src/utils/types";
import { ArrowUpRight, Ellipsis, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/src/components/ui/dialog";
import { toast } from "sonner";
import { api } from "@/src/utils/api";

export const syntheticTableColumns: LangfuseColumnDef<
  RouterOutput["accounts"]["getSyntheticUsers"][number]
>[] = [
  {
    accessorKey: "username",
    id: "username",
    header: "Synthetic User",
    cell: ({ row }) => {
      return (
        <span className="truncate py-3 font-mono text-sm font-semibold">
          {row.original.username}
        </span>
      );
    },
    size: 75,
  },
  {
    accessorKey: "metadata",
    header: "Metadata",
    size: 100,
    cell: ({ row }) => {
      return (
        <span className="text-sm text-muted-foreground">
          {row.original.metadata
            ? JSON.stringify(row.original.metadata)
            : "N/A"}
        </span>
      );
    },
  },
  {
    accessorKey: "conversations",
    header: "Conversations",
    size: 100,
    cell: ({ row }) => {
      return (
        <Link
          className="flex items-center gap-1 whitespace-nowrap underline"
          href={`/project/${row.original.projectId}/conversations?accountId=${row.original.username}`}
        >
          View conversations <ArrowUpRight size={12} />
        </Link>
      );
    },
  },
  {
    accessorKey: "manage",
    header: "Manage",
    size: 80,
    cell: ({ row }) => {
      return <ManageSyntheticUserCell row={row} />;
    },
  },
];

// Extract the manage cell logic into a separate component
function ManageSyntheticUserCell({
  row,
}: {
  row: {
    original: RouterOutput["accounts"]["getSyntheticUsers"][number];
  };
}) {
  const utils = api.useUtils();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const deleteUser = api.accounts.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("Synthetic user deleted");
      utils.accounts.getSyntheticUsers.invalidate();
    },
  });

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <span className="sr-only">Actions</span>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => setDeleteDialogOpen(true)}
            className="flex items-center gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent closeOnInteractionOutside className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Synthetic User</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete the synthetic user &ldquo;
              {row.original.username}&rdquo;? This action cannot be undone.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteUser.mutate({
                  id: row.original.id,
                  projectId: row.original.projectId,
                });

                setDeleteDialogOpen(false);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
