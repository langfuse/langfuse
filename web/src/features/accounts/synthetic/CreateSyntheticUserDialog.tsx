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
  const [metadata, setMetadata] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const createSyntheticUser = api.accounts.createSyntheticUser.useMutation({
    onSuccess: () => {
      toast.success("Synthetic user created");
      utils.accounts.getSyntheticUsers.invalidate();
      setIsOpen(false);
      setUsername("");
      setMetadata("");
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

    let parsedMetadata = null;
    if (metadata.trim()) {
      try {
        parsedMetadata = JSON.parse(metadata);
      } catch (error) {
        toast.error("Invalid JSON format for metadata");
        return;
      }
    }

    createSyntheticUser.mutate({
      username: username.trim(),
      metadata: parsedMetadata,
      projectId: projectId,
    });
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
            <Label htmlFor="metadata">Metadata (JSON - optional)</Label>
            <Input
              id="metadata"
              value={metadata}
              onChange={(e) => setMetadata(e.target.value)}
              placeholder='{"key": "value"}'
              disabled={createSyntheticUser.isLoading}
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
