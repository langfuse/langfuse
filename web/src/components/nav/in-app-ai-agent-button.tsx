import { useCallback, useEffect, useState } from "react";
import { BotMessageSquare } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { KeyboardShortcut } from "@/src/components/ui/keyboard-shortcut";
import {
  useCanUseInAppAgent,
  useInAppAiAgent,
} from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";
import { AIFeaturesDisabledNotice } from "@/src/features/organizations/components/AIFeaturesDisabledNotice";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";

/** Launcher only — the assistant window itself is rendered by
 * InAppAgentWindowHost from the persistent authenticated layout, so it
 * survives the per-page remount of this button on navigation. */
export const InAppAiAgentButton = () => {
  const { organization } = useQueryProjectOrOrganization();
  const { open, setOpen } = useInAppAiAgent();
  const canUseAssistant = useCanUseInAppAgent();
  const [enableDialogOpen, setEnableDialogOpen] = useState(false);

  const openAssistant = useCallback(() => {
    if (organization && !organization.aiFeaturesEnabled) {
      setEnableDialogOpen(true);
      return;
    }

    setOpen(true);
  }, [organization, setOpen]);

  const toggleAssistant = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }

    openAssistant();
  }, [open, openAssistant, setOpen]);

  useEffect(() => {
    if (!canUseAssistant) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "i" ||
        (!event.metaKey && !event.ctrlKey) ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }

      event.preventDefault();
      toggleAssistant();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [canUseAssistant, toggleAssistant]);

  if (!canUseAssistant) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant={open ? "secondary" : "ghost"}
        size="sm"
        aria-label={open ? "Close assistant" : "Open assistant"}
        aria-pressed={open}
        data-ignore-outside-interaction
        onClick={toggleAssistant}
        className="gap-2"
      >
        <BotMessageSquare className="h-4 w-4" />
        <span className="hidden sm:inline">Assistant</span>
        <KeyboardShortcut
          className="hidden bg-transparent shadow-none md:inline-flex"
          keys={[
            typeof navigator !== "undefined" &&
            navigator.userAgent.includes("Mac")
              ? "⌘"
              : "Ctrl",
            "I",
          ]}
        />
      </Button>
      <Dialog open={enableDialogOpen} onOpenChange={setEnableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI features are disabled</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <AIFeaturesDisabledNotice organizationId={organization?.id}>
              The assistant requires AI features to be enabled for this
              organization.
            </AIFeaturesDisabledNotice>
          </DialogBody>
          <DialogFooter>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEnableDialogOpen(false)}
              >
                Close
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
