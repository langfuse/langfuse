import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { DialogHeader } from "@/src/components/ui/dialog";
import { DialogTitle } from "@/src/components/ui/dialog";
import { useState, useMemo } from "react";
import { api } from "@/src/utils/api";
import { toast } from "sonner";
import { Plus, Copy } from "lucide-react";
import { generateSnapshotUsername } from "@/src/features/accounts/utils";

interface CreateSnapshotUserButtonProps {
  username: string;
  sessionNumber: string;
  turnNumber: number;
  projectId: string;
  traceId: string;
  sessionId: string;
}

export function CreateSnapshotUserButton({
  username,
  sessionNumber,
  turnNumber,
  projectId,
  traceId,
  sessionId,
}: CreateSnapshotUserButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Generate the snapshot username only once using useMemo
  // This ensures it's stable across re-renders and only changes if the dependencies change
  const resultingUsername = useMemo(() => {
    return generateSnapshotUsername({
      name: username,
      sessionNumber: sessionNumber,
      turnNumber: turnNumber.toString(),
    });
  }, [username, sessionNumber, turnNumber]);

  const createSnapshotUser = api.accounts.createSnapshotUser.useMutation({
    onSuccess: () => {
      toast.success("Snapshot user created successfully");
      setIsOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleCopyUsername = async () => {
    try {
      await navigator.clipboard.writeText(resultingUsername);
      toast.success("Username copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy username");
    }
  };

  const handleConfirm = () => {
    createSnapshotUser.mutate({
      username,
      sessionNumber,
      turnNumber,
      projectId,
      traceId,
      sessionId,
      snapshotUsername: resultingUsername,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full px-2 text-xs"
        >
          <Plus className="h-4 w-4" /> Snapshot User
        </Button>
      </DialogTrigger>
      <DialogContent closeOnInteractionOutside>
        <DialogHeader>
          <DialogTitle>Create Snapshot User</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-4 py-6">
          <p className="text-sm text-muted-foreground">
            You are about to create a snapshot user for this conversation. You
            can copy the username below and login on the DJB interface to
            continue the conversation.
          </p>
          <div className="space-y-1 text-sm">
            <p>
              <strong>Source:</strong> {username}
            </p>
            <p>
              <strong>Session:</strong> {sessionNumber}
            </p>
            <p>
              <strong>Turn:</strong> {turnNumber}
            </p>
            <p>
              <strong>Trace ID:</strong> {traceId}
            </p>
            <p className="flex items-center gap-1">
              <span>
                <strong>Username:</strong>{" "}
                <span className="font-mono">{resultingUsername}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={handleCopyUsername}
                type="button"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </p>
          </div>
          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={createSnapshotUser.isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={createSnapshotUser.isLoading}
            >
              {createSnapshotUser.isLoading ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
