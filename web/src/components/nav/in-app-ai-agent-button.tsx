import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { BotMessageSquare } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { DialogController } from "@/src/components/ui/dialog-controller";
import { KeyboardShortcut } from "@/src/components/ui/keyboard-shortcut";
import { Layer } from "@/src/components/ui/layer";
import { ControlledInAppAgentWindow } from "@/src/ee/features/in-app-agent/components";
import {
  InAppAgentWindowShell,
  useInAppAgentWindowShellPanelControl,
} from "@/src/ee/features/in-app-agent/components/InAppAgentWindowShell";
import { useInAppAiAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";
import type { InAppAgentWindowConversation } from "@/src/ee/features/in-app-agent/components/InAppAgentWindow";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { AIFeaturesDisabledNotice } from "@/src/features/organizations/components/AIFeaturesDisabledNotice";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";

function DeleteConversationDialog({
  close,
  conversation,
  onDeleteConversation,
}: {
  close: () => void;
  conversation: InAppAgentWindowConversation | null;
  onDeleteConversation: (conversationId: string) => Promise<void>;
}) {
  const [deleteConversation, isDeletingConversation] =
    useWatchedPromiseCallback(async () => {
      if (!conversation) {
        return;
      }

      try {
        await onDeleteConversation(conversation.id);
        close();
      } catch {
        // Error is already surfaced by the provider; keep the dialog open for retry.
      }
    }, [close, conversation, onDeleteConversation]);

  return (
    <ConfirmDialog
      open={conversation !== null}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      title="Delete conversation"
      description="This removes the conversation from your recent conversations. This action cannot be undone."
      confirmLabel="Delete conversation"
      loading={isDeletingConversation}
      onConfirm={deleteConversation}
    />
  );
}

export const InAppAiAgentButton = () => {
  const { organization } = useQueryProjectOrOrganization();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const {
    deleteConversation,
    isAvailable,
    open,
    setOpen,
    isExpanded,
    setIsExpanded,
  } = useInAppAiAgent();
  const hasInAppAgentEntitlement = useHasEntitlement("in-app-agent");
  const canUseAssistant =
    isAvailable &&
    hasInAppAgentEntitlement &&
    isLangfuseCloud &&
    Boolean(organization);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousPanelRectRef = useRef<DOMRect | null>(null);
  const [enableDialogOpen, setEnableDialogOpen] = useState(false);

  const floatingPanelHandle = useInAppAgentWindowShellPanelControl({
    anchorRef: buttonRef,
  });

  useLayoutEffect(() => {
    const previousRect = previousPanelRectRef.current;
    const panel = panelRef.current;

    previousPanelRectRef.current = null;

    if (!previousRect || !panel) {
      return;
    }

    const nextRect = panel.getBoundingClientRect();

    panel.animate(
      [
        {
          transform: `translate(${previousRect.left - nextRect.left}px, ${previousRect.top - nextRect.top}px) scale(${nextRect.width > 0 ? previousRect.width / nextRect.width : 1}, ${nextRect.height > 0 ? previousRect.height / nextRect.height : 1})`,
        },
        { transform: "translate(0, 0) scale(1, 1)" },
      ],
      {
        duration: 180,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      },
    );
  }, [isExpanded]);

  useLayoutEffect(() => {
    if (!open || isExpanded || floatingPanelHandle.geometry) {
      return;
    }

    floatingPanelHandle.initializeGeometry();
  }, [floatingPanelHandle, isExpanded, open]);

  const openAssistant = useCallback(() => {
    if (organization && !organization.aiFeaturesEnabled) {
      setEnableDialogOpen(true);
      return;
    }

    if (!open) {
      floatingPanelHandle.resetGeometry();
    }

    setOpen(true);
  }, [floatingPanelHandle, open, organization, setOpen]);

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
        ref={buttonRef}
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
          keys={[typeof navigator !== "undefined" && navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl", "I"]}
        />
      </Button>
      {open ? (
        <DialogController<InAppAgentWindowConversation>
          dialog={(close, conversation) => (
            <DeleteConversationDialog
              close={close}
              conversation={conversation}
              onDeleteConversation={deleteConversation}
            />
          )}
        >
          {(deleteConversationDialog) => (
            // The assistant window lives in the `agent` overlay layer — a
            // <body>-level layer container that floats above page content and
            // panel surfaces, but below true modals and transient overlays by DOM
            // order alone. No z-index: layer ORDER stacks it (see
            // components/ui/layer.tsx). This replaces the old body portal + z-51,
            // which fought the nav-user dropdown's z-60 at <body> level.
            <Layer name="agent">
              <InAppAgentWindowShell
                floatingPanelHandle={floatingPanelHandle}
                isExpanded={isExpanded}
                panelRef={panelRef}
              >
                {({ isHeaderDragHandleEnabled }) => (
                  <ControlledInAppAgentWindow
                    isHeaderDragHandleEnabled={isHeaderDragHandleEnabled}
                    isExpanded={isExpanded}
                    onDeleteConversation={(conversation) =>
                      deleteConversationDialog.open(conversation)
                    }
                    onExpandedChange={(nextIsExpanded) => {
                      previousPanelRectRef.current =
                        panelRef.current?.getBoundingClientRect() ?? null;
                      setIsExpanded(nextIsExpanded);
                    }}
                    onClose={() => {
                      floatingPanelHandle.clearGeometry();
                      setOpen(false);
                    }}
                  />
                )}
              </InAppAgentWindowShell>
            </Layer>
          )}
        </DialogController>
      ) : null}
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
