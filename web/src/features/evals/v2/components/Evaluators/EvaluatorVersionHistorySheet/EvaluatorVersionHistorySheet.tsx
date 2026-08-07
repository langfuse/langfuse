import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import { EvaluatorVersionHistoryList } from "./components/EvaluatorVersionHistoryList/EvaluatorVersionHistoryList";
import type { EvaluatorVersion } from "./types";

export function EvaluatorVersionHistorySheet({
  open,
  onOpenChange,
  evaluatorName,
  versions,
  currentVersionId,
  defaultModel,
  expandedVersionId,
  onExpandedVersionChange,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evaluatorName: string;
  versions: EvaluatorVersion[];
  currentVersionId: string;
  defaultModel: JudgeModel | null;
  expandedVersionId: string | null;
  onExpandedVersionChange: (versionId: string | null) => void;
  isLoading: boolean;
}) {
  return (
    <Sheet open={open} modal={false} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-5 overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Evaluator versions</SheetTitle>
          <SheetDescription>
            Saved definition versions for {evaluatorName}. Version history is
            read-only.
          </SheetDescription>
        </SheetHeader>
        <EvaluatorVersionHistoryList
          versions={versions}
          currentVersionId={currentVersionId}
          defaultModel={defaultModel}
          expandedVersionId={expandedVersionId}
          onExpandedVersionChange={onExpandedVersionChange}
          isLoading={isLoading}
        />
      </SheetContent>
    </Sheet>
  );
}
