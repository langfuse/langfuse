import { useState } from "react";
import { toast } from "sonner";
import { isPresent, type ScoreConfigDomain } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { api } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { validateNewCategoryLabel } from "@/src/features/scores/lib/annotationFormHelpers";
import { type AnalyticsData } from "@/src/features/scores/types";
import { useTranslations } from "next-intl";

export function AddScoreCategoryDialog({
  projectId,
  config,
  initialLabel,
  source,
  onClose,
  onCategoryAdded,
}: {
  projectId: string;
  config: ScoreConfigDomain;
  initialLabel: string;
  source: AnalyticsData["source"] | undefined;
  onClose: () => void;
  onCategoryAdded: (label: string, numericValue: number) => void;
}) {
  const t = useTranslations("systemUi.scores");
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const [label, setLabel] = useState(initialLabel);
  const existingCategories = config.categories ?? [];
  const validationError = validateNewCategoryLabel(label, existingCategories, {
    required: t("categoryRequired"),
    exists: t("categoryExists"),
  });

  const appendCategory = api.scoreConfigs.appendCategory.useMutation({
    onSuccess: async (data, variables) => {
      capture(
        "score_configs:add_category_inline",
        source ? { source } : undefined,
      );
      await Promise.all([
        utils.scoreConfigs.invalidate(),
        utils.annotationQueues.invalidate(),
      ]);
      const added = data.categories?.find(
        (category) => category.label === variables.label,
      );
      if (isPresent(added?.value)) {
        onCategoryAdded(variables.label, added.value);
      }
      onClose();
    },
    onError: (error) => {
      toast.error(error.message ?? t("addCategoryFailed"));
    },
  });

  const handleConfirm = () => {
    if (validationError) return;
    appendCategory.mutate({
      projectId,
      id: config.id,
      label: label.trim(),
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent closeOnInteractionOutside>
        <DialogHeader variant="action">
          <DialogTitle>{t("addCategoryTitle")}</DialogTitle>
          <DialogDescription>
            {t.rich("addCategoryDescription", {
              name: config.name,
              strong: (chunks) => (
                <span className="text-foreground font-bold">{chunks}</span>
              ),
            })}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleConfirm();
          }}
        >
          <DialogBody>
            <div className="grid gap-2">
              <Label htmlFor="new-score-category-label">
                {t("categoryName")}
              </Label>
              <Input
                id="new-score-category-label"
                value={label}
                autoFocus
                onChange={(event) => setLabel(event.target.value)}
                placeholder={t("categoryPlaceholder")}
              />
              {label.trim() && validationError ? (
                <p className="text-destructive text-sm">{validationError}</p>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter variant="action">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={appendCategory.isPending}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!!validationError}
              loading={appendCategory.isPending}
            >
              {t("addCategoryTitle")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
