import { Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { OverviewSelectionBar } from "@/src/features/evals/v2/components/OverviewSelectionBar/OverviewSelectionBar";
import { useTranslations } from "next-intl";

export function RulesOverviewSelectionBarView({
  selectedCount,
  hasWriteAccess,
  statusChangePending,
  deletePending,
  deleteDialogOpen,
  onClear,
  onEnable,
  onDisable,
  onDelete,
  onDeleteDialogOpenChange,
  onConfirmDelete,
}: {
  selectedCount: number;
  hasWriteAccess: boolean;
  statusChangePending: boolean;
  deletePending: boolean;
  deleteDialogOpen: boolean;
  onClear: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onDelete: () => void;
  onDeleteDialogOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  return (
    <>
      <OverviewSelectionBar selectedCount={selectedCount} onClear={onClear}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasWriteAccess || statusChangePending}
          onClick={onEnable}
        >
          <Play className="mr-2 h-4 w-4" /> {t("enable")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasWriteAccess || statusChangePending}
          onClick={onDisable}
        >
          <Pause className="mr-2 h-4 w-4" /> {t("disable")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasWriteAccess}
          onClick={onDelete}
        >
          <Trash2 className="mr-2 h-4 w-4" /> {t("delete")}
        </Button>
      </OverviewSelectionBar>
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={onDeleteDialogOpenChange}
        title={t("rules.bulkDelete.title")}
        description={t("rules.bulkDelete.description", {
          count: selectedCount,
        })}
        confirmLabel={t("delete")}
        loading={deletePending}
        onConfirm={onConfirmDelete}
      />
    </>
  );
}
