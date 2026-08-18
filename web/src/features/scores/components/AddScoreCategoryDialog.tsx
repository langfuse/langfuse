import { useState } from "react";
import { toast } from "sonner";
import { type ScoreConfigDomain } from "@langfuse/shared";
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
import {
  nextCategoryValue,
  validateNewCategoryLabel,
} from "@/src/features/scores/lib/annotationFormHelpers";
import { type AnalyticsData } from "@/src/features/scores/types";

export function AddScoreCategoryDialog({
  projectId,
  config,
  initialLabel,
  source,
  onClose,
}: {
  projectId: string;
  config: ScoreConfigDomain;
  initialLabel: string;
  source: AnalyticsData["source"] | undefined;
  onClose: () => void;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const [label, setLabel] = useState(initialLabel);
  const existingCategories = config.categories ?? [];
  const validationError = validateNewCategoryLabel(label, existingCategories);

  const updateScoreConfig = api.scoreConfigs.update.useMutation({
    onSuccess: async () => {
      capture(
        "score_configs:add_category_inline",
        source ? { source } : undefined,
      );
      await Promise.all([
        utils.scoreConfigs.invalidate(),
        utils.annotationQueues.invalidate(),
      ]);
      onClose();
    },
    onError: (error) => {
      toast.error(error.message ?? "Failed to add category");
    },
  });

  const handleConfirm = () => {
    if (validationError) return;
    const trimmed = label.trim();
    updateScoreConfig.mutate({
      projectId,
      id: config.id,
      categories: [
        ...existingCategories,
        { label: trimmed, value: nextCategoryValue(existingCategories) },
      ],
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
          <DialogTitle>Add category</DialogTitle>
          <DialogDescription>
            This adds a category to{" "}
            <span className="text-foreground font-bold">{config.name}</span> for
            everyone in this project.
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
              <Label htmlFor="new-score-category-label">Category name</Label>
              <Input
                id="new-score-category-label"
                value={label}
                autoFocus
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Enter a category name"
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
              disabled={updateScoreConfig.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!!validationError}
              loading={updateScoreConfig.isPending}
            >
              Add category
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
