import type { LangfuseColumnDef } from "@/src/components/table/types";
import type { RouterOutput } from "@/src/utils/types";
import { Edit, Ellipsis, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
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

export const snapshotTableColumns: LangfuseColumnDef<
  RouterOutput["accounts"]["getSnapshotUsers"][number]
>[] = [
  {
    accessorKey: "username",
    id: "username",
    header: "Snapshot User",
    cell: ({ row }) => {
      return (
        <span className="truncate py-3 font-mono text-sm font-semibold">
          {row.original.username}
        </span>
      );
    },
    size: 100,
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    size: 50,
    cell: ({ row }) => {
      return (
        <span className="text-sm text-muted-foreground">
          {row.original.createdAt
            ? new Date(row.original.createdAt).toLocaleDateString()
            : "N/A"}
        </span>
      );
    },
  },
  {
    accessorKey: "metadata",
    header: "Snapshot Metadata",
    size: 150,
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
    accessorKey: "manage",
    header: "Manage",
    size: 80,
    cell: ({ row }) => {
      return <ManageSnapshotUserCell row={row} />;
    },
  },
];

// Extract the manage cell logic into a separate component
function ManageSnapshotUserCell({
  row,
}: {
  row: {
    original: RouterOutput["accounts"]["getSnapshotUsers"][number];
  };
}) {
  const utils = api.useUtils();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editUsername, setEditUsername] = useState(row.original.username);
  const [editPassword, setEditPassword] = useState("");

  const deleteUser = api.accounts.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("Snapshot user deleted");
      utils.accounts.getSnapshotUsers.invalidate();
    },
  });

  const updateUser = api.accounts.updateUser.useMutation({
    onSuccess: () => {
      toast.success("Snapshot user updated");
      utils.accounts.getSnapshotUsers.invalidate();
      setEditDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message);
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
              setEditPassword("");
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
            <DialogTitle>Edit Snapshot User</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-username">Email</Label>
                <Input
                  id="edit-username"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  placeholder="Enter username"
                  className="font-mono"
                  disabled={updateUser.isLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-password">Password</Label>
                <Input
                  id="edit-password"
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Enter new password"
                  disabled={updateUser.isLoading}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={updateUser.isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                updateUser.mutate({
                  id: row.original.id,
                  username: editUsername.trim(),
                  password: editPassword.trim(),
                  projectId: row.original.projectId,
                });
              }}
              disabled={updateUser.isLoading}
            >
              {updateUser.isLoading ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent closeOnInteractionOutside className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Snapshot User</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete the snapshot user &ldquo;
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
