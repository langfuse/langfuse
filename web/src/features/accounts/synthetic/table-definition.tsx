import type { LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import type { RouterOutput } from "@/src/utils/types";
import {
  ArrowUpRight,
  Edit,
  Ellipsis,
  FileCode,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
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
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";

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
    size: 100,
  },
  {
    accessorKey: "metadata",
    header: "Notes",
    size: 150,
    cell: ({ row }) => {
      const notes = row.original.metadata?.synthetic?.notes;
      return (
        <span className="text-sm text-muted-foreground">
          {notes || "No notes"}
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
  const router = useRouter();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [generateConversationDialogOpen, setGenerateConversationDialogOpen] =
    useState(false);
  const [editUsername, setEditUsername] = useState(row.original.username);
  const [editNotes, setEditNotes] = useState(
    row.original.metadata?.synthetic?.notes || "",
  );

  const deleteUser = api.accounts.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("Synthetic user deleted");
      utils.accounts.getSyntheticUsers.invalidate();
    },
  });

  const updateSyntheticUser = api.accounts.updateSyntheticUser.useMutation({
    onSuccess: () => {
      toast.success("Synthetic user updated");
      utils.accounts.getSyntheticUsers.invalidate();
      setEditDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const generateConversation = api.accounts.generateConversation.useMutation({
    onSuccess: () => {
      toast.success("Conversation generation started");
      setGenerateConversationDialogOpen(false);
      // Redirect to conversations page for this user
      router.push(`/project/${row.original.projectId}/conversations?accountId=${row.original.username}`);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to generate conversation");
    },
  });

  const handleGenerateConversation = () => {
    setGenerateConversationDialogOpen(true);
  };

  const handleConfirmGenerateConversation = () => {
    generateConversation.mutate({
      username: row.original.username,
      projectId: row.original.projectId,
    });
  };

  // Extract prompt name from metadata
  const promptName = row.original.metadata?.synthetic?.prompt_name;
  const promptUrl = promptName
    ? `/project/${row.original.projectId}/prompts/${encodeURIComponent(promptName)}`
    : null;

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
            onClick={() => handleGenerateConversation()}
            className="flex items-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Generate Conversation
          </DropdownMenuItem>
          {promptUrl && (
            <DropdownMenuItem asChild>
              <Link href={promptUrl} className="flex items-center gap-2">
                <FileCode className="h-4 w-4" />
                Update Prompt
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => {
              setEditUsername(row.original.username);
              setEditNotes(row.original.metadata?.synthetic?.notes || "");
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
                <Label htmlFor="edit-username">Username</Label>
                <Input
                  id="edit-username"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  placeholder="Enter username"
                  className="font-mono"
                  disabled={updateSyntheticUser.isLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Enter notes about this synthetic user"
                  rows={3}
                  disabled={updateSyntheticUser.isLoading}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={updateSyntheticUser.isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                updateSyntheticUser.mutate({
                  id: row.original.id,
                  username: editUsername.trim(),
                  notes: editNotes.trim(),
                  projectId: row.original.projectId,
                });
              }}
              disabled={updateSyntheticUser.isLoading}
            >
              {updateSyntheticUser.isLoading ? "Saving..." : "Save changes"}
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

      {/* Generate Conversation Confirmation Dialog */}
      <Dialog
        open={generateConversationDialogOpen}
        onOpenChange={setGenerateConversationDialogOpen}
      >
        <DialogContent closeOnInteractionOutside>
          <DialogHeader>
            <DialogTitle>Generate Conversation</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You are about to generate a new conversation for this synthetic
                user. This will create a new conversation session using the
                user's profile and preferences.
              </p>
              <div className="space-y-1 text-sm">
                <p>
                  <strong>Username:</strong>{" "}
                  <span className="font-mono">{row.original.username}</span>
                </p>
                {row.original.metadata?.synthetic?.notes && (
                  <p>
                    <strong>Notes:</strong>{" "}
                    {row.original.metadata.synthetic.notes}
                  </p>
                )}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setGenerateConversationDialogOpen(false)}
              disabled={generateConversation.isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmGenerateConversation}
              disabled={generateConversation.isLoading}
            >
              {generateConversation.isLoading
                ? "Generating..."
                : "Generate Conversation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
