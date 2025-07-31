import type { LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import type { RouterOutput } from "@/src/utils/types";
import { ArrowUpRight, Edit, Ellipsis, Trash2 } from "lucide-react";
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
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
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

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editUsername, setEditUsername] = useState(row.original.username);
  const [editMetadata, setEditMetadata] = useState(
    row.original.metadata ? JSON.stringify(row.original.metadata, null, 2) : "",
  );

  const deleteSyntheticUser = api.accounts.deleteSyntheticUser.useMutation({
    onSuccess: () => {
      toast.success("Synthetic user deleted");
      utils.accounts.getSyntheticUsers.invalidate();
    },
  });

  const updateSyntheticUser = api.accounts.updateSyntheticUser.useMutation({
    onSuccess: () => {
      toast.success("Synthetic user updated");
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
            onClick={() => {
              setEditUsername(row.original.username);
              setEditMetadata(
                row.original.metadata
                  ? JSON.stringify(row.original.metadata, null, 2)
                  : "",
              );
              setEditDialogOpen(true);
            }}
            className="flex items-center gap-2"
          >
            <Edit className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setDeleteDialogOpen(true)}
            className="flex items-center gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent
          closeOnInteractionOutside={true}
          className="sm:max-w-[425px]"
        >
          <DialogHeader>
            <DialogTitle>Edit Synthetic User</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  placeholder="Enter username"
                  className="font-mono"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="metadata">Metadata (JSON)</Label>
                <Input
                  id="metadata"
                  value={editMetadata}
                  onChange={(e) => setEditMetadata(e.target.value)}
                  placeholder="Enter metadata as JSON"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                let parsedMetadata = null;
                try {
                  if (editMetadata.trim()) {
                    parsedMetadata = JSON.parse(editMetadata);
                  }
                } catch (error) {
                  toast.error("Invalid JSON format");
                  return;
                }

                updateSyntheticUser.mutate({
                  id: row.original.id,
                  username: editUsername,
                  metadata: parsedMetadata,
                  projectId: row.original.projectId,
                });

                setEditDialogOpen(false);
              }}
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                deleteSyntheticUser.mutate({
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
