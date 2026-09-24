import React, { useState } from "react";
import { api } from "@/src/utils/api";
import {
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogBody,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { showErrorToast } from "@/src/features/notifications";

interface EditDialogDashboardContentProps {
  closeDialog: () => void;
  projectId: string;
  dashboardId: string;
  initialName: string;
  initialDescription: string;
}

export function EditDialogDashboardContent({
  closeDialog,
  projectId,
  dashboardId,
  initialName,
  initialDescription,
}: EditDialogDashboardContentProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const utils = api.useUtils();

  const updateDashboard = api.dashboard.updateDashboardMetadata.useMutation({
    onSuccess: () => {
      utils.dashboard.invalidate();
      closeDialog();
    },
    onError: (e) => {
      showErrorToast("Failed to update dashboard", e.message);
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      showErrorToast("Validation error", "Dashboard name is required");
      return;
    }

    updateDashboard.mutate({
      projectId,
      dashboardId,
      name: name.trim(),
      description: description.trim(),
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit Dashboard</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dashboard name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dashboard description"
              rows={3}
            />
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <div className="flex gap-2">
          <Button onClick={closeDialog} variant="outline" type="button">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            type="button"
            loading={updateDashboard.isPending}
          >
            Save Changes
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
