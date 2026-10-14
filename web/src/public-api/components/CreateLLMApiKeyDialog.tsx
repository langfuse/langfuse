/* eslint-disable @repo/no-abstracted-overlay-trigger, @repo/no-null-render */
import { PlusIcon } from "lucide-react";
import { Button } from "@/src/app/design-system/legacy-primitives/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/app/design-system/legacy-primitives/dialog";
import { useHasProjectAccess } from "@/src/identity/access-control";
import useProjectIdFromURL from "@/src/app/hooks/useProjectIdFromURL";
import { useUiCustomization } from "@/src/ee/app/branding";
import { CreateLLMApiKeyForm } from "@/src/public-api/components/CreateLLMApiKeyForm";

export function CreateLLMApiKeyDialog({
  open,
  setOpen,
  hideTrigger = false,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  /**
   * Hide the built-in "Add LLM Connection" trigger button and render only the
   * (controlled) dialog. Use this when the dialog is opened from elsewhere — e.g.
   * from inside a Select/dropdown, where the dialog must live OUTSIDE the
   * dropdown content so it survives the dropdown closing. See the overlay
   * lifecycle note in web/AGENTS.md.
   */
  hideTrigger?: boolean;
}) {
  const projectId = useProjectIdFromURL();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "llmApiKeys:create",
  });
  const uiCustomization = useUiCustomization();

  if (!projectId || !hasAccess) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
      }}
    >
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="secondary">
            <PlusIcon className="icon-base mr-1.5 -ml-0.5" aria-hidden="true" />
            Add LLM Connection
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90%] min-w-[40vw] overflow-auto">
        <DialogHeader>
          <DialogTitle>New LLM Connection</DialogTitle>
        </DialogHeader>
        {open && (
          <CreateLLMApiKeyForm
            owner={{ scope: "project", projectId }}
            onSuccess={() => setOpen(false)}
            customization={uiCustomization}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
