import { Button } from "@/src/components/ui/button";
import { useSharedUiTranslations } from "@/src/utils/shared-ui-translations";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { AIFeaturesDisabledNotice } from "@/src/features/organizations/components/AIFeaturesDisabledNotice";

export function InAppAgentDisabledDialog({
  open,
  onOpenChange,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId?: string;
}) {
  const t = useSharedUiTranslations("agent");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("disabledTitle")}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <AIFeaturesDisabledNotice
            organizationId={organizationId}
            onSettingsOpened={() => {
              onOpenChange(false);
            }}
          >
            {t("disabledDescription")}
          </AIFeaturesDisabledNotice>
        </DialogBody>
        <DialogFooter>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t("close")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
