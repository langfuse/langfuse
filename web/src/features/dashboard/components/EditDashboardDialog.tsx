import React, { useState } from "react";
import { api } from "@/src/utils/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogBody,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useTranslations } from "next-intl";

interface EditDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  dashboardId: string;
  initialName: string;
  initialDescription: string;
}

export function EditDashboardDialog({
  open,
  onOpenChange,
  projectId,
  dashboardId,
  initialName,
  initialDescription,
}: EditDashboardDialogProps) {
  const t = useTranslations("playgroundDashboard.dashboard.edit");
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const utils = api.useUtils();

  const updateDashboard = api.dashboard.updateDashboardMetadata.useMutation({
    onSuccess: () => {
      utils.dashboard.invalidate();
      onOpenChange(false);
    },
    onError: (e) => {
      showErrorToast(t("updateFailed"), e.message);
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      showErrorToast(t("validationError"), t("nameRequired"));
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">{t("name")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">{t("description")}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                rows={3}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex gap-2">
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              type="button"
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSave}
              type="button"
              loading={updateDashboard.isPending}
            >
              {t("save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
