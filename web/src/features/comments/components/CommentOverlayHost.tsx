import { useState, type ComponentProps, type ReactNode } from "react";
import { useStore } from "zustand";
import { useRouter } from "next/router";
import { X } from "lucide-react";
import { type CommentObjectType } from "@langfuse/shared";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/src/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { CommentList } from "../CommentList";
import { CommentComposer } from "./CommentComposer";
import { type SelectionData } from "../contexts/InlineCommentSelectionContext";
import {
  type CommentOverlay,
  type CommentOverlayStore,
  type CommentTarget,
} from "../state/commentOverlayStore";
import { refreshCommentQueries } from "../actions/refreshCommentQueries";

export function CommentOverlayState({
  store,
  initialState,
  children,
}: {
  store: CommentOverlayStore;
  initialState?: () => CommentTarget | undefined;
  children: (overlay: CommentOverlay) => ReactNode;
}) {
  const [initialOverlay] = useState<CommentOverlay | undefined>(() => {
    const target = initialState?.();
    return target
      ? { id: 0, target, presentation: "thread", isOpen: true }
      : undefined;
  });
  const selectedOverlay = useStore(store, (state) => state.overlay);
  const overlay = selectedOverlay ?? initialOverlay;
  return overlay ? children(overlay) : null;
}

export function CommentOverlayHost({
  store,
  projectId,
  overlay,
  onCommentChange,
  onCloseAutoFocus,
}: {
  store: CommentOverlayStore;
  projectId: string;
  overlay: CommentOverlay;
  onCommentChange?: () => void | Promise<void>;
  onCloseAutoFocus: ComponentProps<typeof DrawerContent>["onCloseAutoFocus"];
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const actions = store.getState().actions;
  const target = overlay.target;
  const clearCommentUrl = () => {
    if (router.query.comments !== "open") return;
    const { comments, commentObjectType, commentObjectId, ...rest } =
      router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, {
      shallow: true,
    });
  };
  const close = () => {
    if (
      actions.close(overlay, () =>
        window.confirm("Discard your unsent comment?"),
      )
    )
      clearCommentUrl();
  };
  const guardProps = {
    onDraftChange: (hasDraft: boolean) =>
      actions.setDraft(overlay.id, hasDraft),
    onMentionDropdownChange: (open: boolean) =>
      actions.setMentionsOpen(overlay.id, open),
  };
  return overlay.presentation === "composer" ? (
    <Dialog
      open={overlay.isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="overflow-visible"
        closeOnInteractionOutside
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>Add a comment</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <CommentComposer
            key={overlay.id}
            projectId={projectId}
            objectId={target.objectId}
            objectType={target.objectType}
            objectStartTime={target.objectStartTime}
            pendingSelection={
              target.type === "inline-comment" ? target.selection : null
            }
            {...guardProps}
            onCommentCreated={async () => {
              if (actions.close(overlay)) clearCommentUrl();
              await refreshCommentQueries({
                utils,
                target: { projectId, ...target },
                onCommentChange,
              });
            }}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  ) : (
    <Drawer
      open={overlay.isOpen}
      blockTextSelection={false}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <CommentDrawerContent
        key={overlay.id}
        projectId={projectId}
        objectId={target.objectId}
        objectType={target.objectType}
        objectStartTime={target.objectStartTime}
        pendingSelection={
          target.type === "inline-comment" ? target.selection : null
        }
        onSelectionUsed={() => actions.consumeSelection(overlay)}
        onCommentChange={onCommentChange}
        onCloseAutoFocus={onCloseAutoFocus}
        {...guardProps}
      />
    </Drawer>
  );
}

type CommentDrawerContentProps = {
  projectId: string;
  objectId: string;
  objectType: CommentObjectType;
  objectStartTime?: Date | null;
  pendingSelection: SelectionData | null;
  onSelectionUsed: () => void;
  onCommentChange?: () => void | Promise<void>;
  onMentionDropdownChange: (isOpen: boolean) => void;
  onDraftChange: (hasDraft: boolean) => void;
  onCloseAutoFocus: ComponentProps<typeof DrawerContent>["onCloseAutoFocus"];
};

function CommentDrawerContent({
  projectId,
  objectId,
  objectType,
  objectStartTime,
  pendingSelection,
  onSelectionUsed,
  onCommentChange,
  onMentionDropdownChange,
  onDraftChange,
  onCloseAutoFocus,
}: CommentDrawerContentProps) {
  return (
    <DrawerContent
      overlayClassName="bg-primary/10"
      className="h-screen-with-banner max-h-screen-with-banner overflow-hidden outline-hidden"
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <DrawerHeader className="flex shrink-0 flex-row items-center justify-between border-b text-left">
        <DrawerTitle>Comments</DrawerTitle>
        <DrawerClose asChild>
          <Button variant="ghost" size="icon" title="Close comments">
            <X className="size-4" />
          </Button>
        </DrawerClose>
      </DrawerHeader>
      <div data-vaul-no-drag className="min-h-0 flex-1 overflow-hidden">
        <CommentList
          key={`${projectId}-${objectType}-${objectId}`}
          projectId={projectId}
          objectId={objectId}
          objectType={objectType}
          objectStartTime={objectStartTime}
          onMentionDropdownChange={onMentionDropdownChange}
          onDraftChange={onDraftChange}
          isDrawerOpen
          pendingSelection={pendingSelection}
          onSelectionUsed={onSelectionUsed}
          onCommentChange={onCommentChange}
        />
      </div>
    </DrawerContent>
  );
}
