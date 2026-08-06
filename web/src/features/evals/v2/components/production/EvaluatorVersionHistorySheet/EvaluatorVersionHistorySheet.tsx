import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import { EvaluatorVersionHistoryDetail } from "./components/EvaluatorVersionHistoryDetail";
import { EvaluatorVersionHistoryList } from "./components/EvaluatorVersionHistoryList/EvaluatorVersionHistoryList";
import type { EvaluatorVersion } from "./types";

export function EvaluatorVersionHistorySheet({
  open,
  onOpenChange,
  evaluatorName,
  versions,
  currentVersionId,
  selectedVersion,
  selectedVersionModel,
  defaultModel,
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
  selectedVersionModel: { provider: string; model: string } | null;
  defaultModel: { provider: string; model: string } | null;
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
            selectedModel={selectedVersionModel}
            defaultModel={defaultModel}
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
