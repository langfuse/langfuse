import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import { EvaluatorVersionHistoryDetail } from "./EvaluatorVersionHistoryDetail";
import { EvaluatorVersionHistoryList } from "./EvaluatorVersionHistoryList";
import type { EvaluatorVersion } from "./types";

export function EvaluatorVersionHistorySheet({
  open,
  onOpenChange,
  evaluatorName,
  versions,
  currentVersionId,
  selectedVersion,
  selectedVersionModelLabel,
  selectedVersionUsesProjectDefaultModel,
  isLoading,
  onSelectVersion,
  onBack,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evaluatorName: string;
  versions: EvaluatorVersion[];
  currentVersionId: string;
  selectedVersion: EvaluatorVersion | undefined;
  selectedVersionModelLabel: string;
  selectedVersionUsesProjectDefaultModel: boolean;
  isLoading: boolean;
  onSelectVersion: (versionId: string) => void;
  onBack: () => void;
}) {
  return (
    <Sheet open={open} modal={false} onOpenChange={onOpenChange}>
      <SheetContent
        showOverlay={false}
        className="flex flex-col gap-5 overflow-y-auto sm:max-w-2xl"
      >
        {selectedVersion ? (
          <EvaluatorVersionHistoryDetail
            version={selectedVersion}
            modelLabel={selectedVersionModelLabel}
            usesProjectDefaultModel={selectedVersionUsesProjectDefaultModel}
            onBack={onBack}
          />
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Evaluator versions</SheetTitle>
              <SheetDescription>
                Saved definition versions for {evaluatorName}. Version history
                is read-only.
              </SheetDescription>
            </SheetHeader>
            <EvaluatorVersionHistoryList
              versions={versions}
              currentVersionId={currentVersionId}
              isLoading={isLoading}
              onSelectVersion={onSelectVersion}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
