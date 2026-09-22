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
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { validateNewCategoryLabel } from "@/src/features/scores/lib/annotationFormHelpers";
import { type AnnotationAnalyticsContext } from "@/src/features/scores/lib/annotationAnalytics";

export function AddScoreCategoryDialog({
  projectId,
  config,
  initialLabel,
  analyticsData,
  onClose,
  onCategoryAdded,
  isActive = true,
}: {
  projectId: string;
  config: ScoreConfigDomain;
  initialLabel: string;
  analyticsData: AnnotationAnalyticsContext;
  onClose: () => void;
  onCategoryAdded: (label: string, numericValue: number) => void;
  isActive?: boolean;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const [label, setLabel] = useState(initialLabel);
  const existingCategories = config.categories ?? [];
  const validationError = validateNewCategoryLabel(label, existingCategories);

  const appendCategory = api.scoreConfigs.appendCategory.useMutation({
    onSuccess: async (data, variables) => {
      capture("score_configs:add_category_inline", analyticsData);
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
      toast.error(error.message ?? "Failed to add category");
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
      open={isActive}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        closeOnInteractionOutside
        onCloseAutoFocus={(event) => {
          if (!isActive) event.preventDefault();
        }}
      >
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
              disabled={appendCategory.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!!validationError}
              loading={appendCategory.isPending}
            >
              Add category
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
