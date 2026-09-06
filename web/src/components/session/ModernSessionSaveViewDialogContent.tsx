import { Button } from "@/src/components/ui/button";
import { useState } from "react";
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { useTranslations } from "next-intl";

type ModernSessionSaveViewDialogContentProps = {
  isSaving: boolean;
  onCancel: () => void;
  onSave: (viewName: string) => void;
};

export function ModernSessionSaveViewDialogContent({
  isSaving,
  onCancel,
  onSave,
}: ModernSessionSaveViewDialogContentProps) {
  const t = useTranslations("sessions.views");
  const [viewName, setViewName] = useState("");
  const saveView = () => onSave(viewName.trim());

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("saveTitle")}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div>
          <label
            htmlFor="modern-session-view-name"
            className="mb-2 block text-sm font-bold"
          >
            {t("viewName")}
          </label>
          <Input
            id="modern-session-view-name"
            value={viewName}
            onChange={(event) => setViewName(event.target.value)}
            placeholder={t("namePlaceholder")}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter" && viewName.trim() && !isSaving) {
                saveView();
              }
            }}
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button
          loading={isSaving}
          disabled={!viewName.trim()}
          onClick={saveView}
        >
          {t("save")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
