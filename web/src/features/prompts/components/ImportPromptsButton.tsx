import { useRef, useState } from "react";
import { UploadIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { ActionButton } from "@/src/components/ActionButton";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { parsePromptsCsv } from "@/src/features/prompts/utils/csvHelpers";
import type { CreatePromptType } from "@/src/features/prompts/server/utils/validation";
import { api } from "@/src/utils/api";

export const ImportPromptsButton = ({ projectId }: { projectId: string }) => {
  const hasAccess = useHasProjectAccess({ projectId, scope: "prompts:CUD" });
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importMutation = api.prompts.importMany.useMutation();

  async function handleFile(file: File) {
    try {
      let prompts: CreatePromptType[] = [];
      if (file.name.endsWith(".csv")) {
        prompts = await parsePromptsCsv(file);
      } else {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error("Invalid JSON file");
        prompts = parsed as CreatePromptType[];
      }
      await importMutation.mutateAsync({ projectId, prompts });
      showSuccessToast({
        title: "Import successful",
        description: file.name,
      });
      setOpen(false);
    } catch (e) {
      showErrorToast(
        "Import failed",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleFile(file);
    e.target.value = "";
  };

  return (
    <Dialog open={hasAccess && open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <ActionButton
          variant="outline"
          hasAccess={hasAccess}
          icon={<UploadIcon className="h-4 w-4" aria-hidden="true" />}
        >
          Import
        </ActionButton>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Prompts</DialogTitle>
        </DialogHeader>
        <Input ref={fileInputRef} type="file" accept=".json,.csv" onChange={onChange} />
      </DialogContent>
    </Dialog>
  );
};
