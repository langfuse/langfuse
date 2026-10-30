import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { showErrorToast } from "@/src/features/notifications";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";

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
      showErrorToast(
        "Failed to update dashboard",
        e.message,
        classifyTrpcToastError(e, "dashboard.update"),
      );
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      showErrorToast("Validation error", "Dashboard name is required", {
        operation: "dashboard.update",
        errorOrigin: "frontend",
        errorCategory: "user_input",
      });
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
    <Dialog
      title="Edit Dashboard"
      closeOnInteractionOutside={false}
      closeLabel="Cancel"
      actions={[
        {
          label: "Save Changes",
          loading: updateDashboard.isPending,
          onClick: handleSave,
        },
      ]}
    >
      <Dialog.Body>
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
      </Dialog.Body>
    </Dialog>
  );
}
