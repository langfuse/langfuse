import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { DialogHeader } from "@/src/components/ui/dialog";
import { DialogTitle } from "@/src/components/ui/dialog";
import { useState } from "react";
import { api } from "@/src/utils/api";
import { toast } from "sonner";
import { Plus } from "lucide-react";

interface CreateSnapshotUserButtonProps {
  username: string;
  sessionNumber: number;
  turnNumber: number;
  projectId: string;
  traceId: string;
}

export function CreateSnapshotUserButton({
  username,
  sessionNumber,
  turnNumber,
  projectId,
  traceId,
}: CreateSnapshotUserButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const createSnapshotUser = api.accounts.createSnapshotUser.useMutation({
    onSuccess: () => {
      toast.success("Snapshot user created successfully");
      setIsOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleConfirm = () => {
    createSnapshotUser.mutate({
      username,
      sessionNumber,
      turnNumber,
      projectId,
      traceId,
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
          <Plus className="h-4 w-4" /> Add Snap User
        </Button>
      </DialogTrigger>
      <DialogContent closeOnInteractionOutside>
        <DialogHeader>
          <DialogTitle>Create Snapshot User</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-4 py-6">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to create a snapshot user for this
            conversation?
          </p>
          <div className="space-y-1 text-sm">
            <p>
              <strong>Username:</strong> {username}
            </p>
            <p>
              <strong>Session:</strong> {sessionNumber}
            </p>
            <p>
              <strong>Turn:</strong> {turnNumber}
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
              {createSnapshotUser.isLoading ? "Creating..." : "Confirm"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
