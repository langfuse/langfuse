import type { LangfuseColumnDef } from "@/src/components/table/types";
import type { RouterOutput } from "@/src/utils/types";
import { Button } from "@/src/components/ui/button";
import { Ellipsis, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/router";
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

export const conversationTableColumns: LangfuseColumnDef<
  RouterOutput["conversations"]["all"]["sessions"][number]
>[] = [
  {
    accessorKey: "userId",
    id: "userId",
    header: "User",
    cell: ({ row }) => {
      return (
        <span className="truncate py-3 font-mono text-sm font-semibold">
          {row.original.userIds.join(", ")}
        </span>
      );
    },
    size: 75,
  },
  {
    accessorKey: "id",
    id: "id",
    header: "Session",
    cell: ({ row }) => {
      return (
        <span className="truncate py-3 font-mono text-sm font-semibold">
          {row.original.id}
        </span>
      );
    },
  },
  {
    accessorKey: "createdAt",
    id: "createdAt",
    header: "Date",
    cell: ({ row }) => {
      return (
        <span className="truncate py-3 font-mono text-sm font-semibold">
          {row.original.createdAt.toLocaleString()}
        </span>
      );
    },
  },
  {
    accessorKey: "manage",
    header: "Manage",
    size: 80,
    cell: ({ row }) => {
      return <ManageConversationCell row={row} />;
    },
  },
];

// Extract the manage cell logic into a separate component
function ManageConversationCell({
  row,
}: {
  row: {
    original: RouterOutput["conversations"]["all"]["sessions"][number];
  };
}) {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const [replayDialogOpen, setReplayDialogOpen] = useState(false);
  const [replayUsername, setReplayUsername] = useState("");

  const replayConversation = api.accounts.threadReplay.useMutation({
    onSuccess: () => {
      toast.success("Conversation replay started");
      setReplayDialogOpen(false);
      setReplayUsername("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to replay conversation");
    },
  });

  const handleReplayConversation = (event: React.MouseEvent) => {
    event.stopPropagation();
    setReplayDialogOpen(true);
  };

  const extractUuidFromSessionId = (sessionId: string): string => {
    // Extract UUID from session ID format like "Session1_01Aug_c3c662e8-8aba-453d-823d-59b9f9a36fdc"
    // Take everything after the last underscore
    const parts = sessionId.split('_');
    return parts[parts.length - 1];
  };

  const handleConfirmReplay = () => {
    if (!replayUsername.trim()) {
      toast.error("Please enter a username");
      return;
    }

    const threadId = extractUuidFromSessionId(row.original.id);
    
    replayConversation.mutate({
      threadId: threadId,
      userIdentifier: replayUsername.trim(),
      projectId: projectId,
    });
  };

  return (
    <div
      className="flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="sr-only">Actions</span>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(e) => handleReplayConversation(e)}
            className="flex items-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Replay Conversation
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Replay Conversation Dialog */}
      <Dialog open={replayDialogOpen} onOpenChange={setReplayDialogOpen}>
        <DialogContent closeOnInteractionOutside className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Replay Conversation</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You are about to replay this conversation. Please enter the
                username under which the conversation will be replayed.
              </p>
              <div className="space-y-1 text-sm">
                <p>
                  <strong>Session ID:</strong>{" "}
                  <span className="font-mono">{row.original.id}</span>
                </p>
                <p>
                  <strong>Original User:</strong>{" "}
                  <span className="font-mono">
                    {row.original.userIds.join(", ")}
                  </span>
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="replay-username">Username for Replay</Label>
                <Input
                  id="replay-username"
                  value={replayUsername}
                  onChange={(e) => setReplayUsername(e.target.value)}
                  placeholder="Enter username"
                  className="font-mono"
                  disabled={replayConversation.isLoading}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReplayDialogOpen(false);
                setReplayUsername("");
              }}
              disabled={replayConversation.isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReplay}
              disabled={replayConversation.isLoading || !replayUsername.trim()}
            >
              {replayConversation.isLoading
                ? "Replaying..."
                : "Replay Conversation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
