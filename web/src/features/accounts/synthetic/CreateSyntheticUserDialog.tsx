import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { DialogHeader } from "@/src/components/ui/dialog";
import { DialogTitle } from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { api } from "@/src/utils/api";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface CreateSyntheticUserDialogProps {
  projectId: string;
}

export function CreateSyntheticUserDialog({
  projectId,
}: CreateSyntheticUserDialogProps) {
  const utils = api.useUtils();

  const [username, setUsername] = useState("");
  const [notes, setNotes] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const createSyntheticUser = api.accounts.createSyntheticUser.useMutation({
    onSuccess: () => {
      toast.success("Synthetic user created");
      utils.accounts.getSyntheticUsers.invalidate();
      setIsOpen(false);
      setUsername("");
      setNotes("");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      toast.error("Please fill in username");
      return;
    }

    createSyntheticUser.mutate({
      username: username.trim(),
      notes: notes.trim(),
      projectId: projectId,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={createSyntheticUser.isLoading}
          variant="outline"
          className="gap-1 bg-blue-600 text-white"
        >
          <Plus size={12} />
          Add Synthetic User
        </Button>
      </DialogTrigger>
      <DialogContent closeOnInteractionOutside>
        <DialogHeader>
          <DialogTitle>Create Synthetic User</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-4 py-6">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              disabled={createSyntheticUser.isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter notes about this synthetic user (⌘+Enter to submit)"
              disabled={createSyntheticUser.isLoading}
              rows={3}
            />
          </div>
          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={createSyntheticUser.isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createSyntheticUser.isLoading}>
              {createSyntheticUser.isLoading
                ? "Creating..."
                : "Create Synthetic User"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
