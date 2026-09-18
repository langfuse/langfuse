import {
  DrawerContent,
  DrawerController,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/src/components/ui/drawer";
import { CommentList } from "@/src/features/comments/CommentList";
import { useHasProjectAccess } from "@/src/features/rbac";
import { type CommentObjectType } from "@langfuse/shared";
import { useRouter } from "next/router";
import { type ReactNode, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/src/components/ui/dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { api } from "@/src/utils/api";
import { CommentComposer } from "./components/CommentComposer";
import { type SelectionData } from "./contexts/InlineCommentSelectionContext";

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
}: CommentDrawerContentProps) {
  return (
    <DrawerContent
      overlayClassName="bg-primary/10"
      className="h-screen-with-banner max-h-screen-with-banner overflow-hidden outline-hidden"
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

export type CommentDrawerControllerProps = {
  projectId: string;
  // Evaluated only on mount; use for deep-linked comments, not reactive drawer state.
  initialState?: () => CommentDrawerState | undefined;
  mode?: "read-write" | "read-only";
  count?: number;
  onCommentChange?: () => void | Promise<void>;
  children: (control: {
    disabled: boolean;
    openDrawer: (state: CommentDrawerState) => void;
  }) => ReactNode;
};

type CommentDrawerTarget = {
  objectId: string;
  objectType: CommentObjectType;
  objectStartTime?: Date | null;
};

type CommentDrawerState = CommentDrawerTarget &
  ({ type: "comments" } | { type: "inline-comment"; selection: SelectionData });

export function getCommentDrawerInitialStateFromUrl(
  query: Record<string, string | string[] | undefined>,
) {
  const objectId = query.commentObjectId;
  const objectType = query.commentObjectType;
  if (
    query.comments !== "open" ||
    typeof objectId !== "string" ||
    typeof objectType !== "string"
  ) {
    return;
  }

  return {
    type: "comments" as const,
    objectId,
    objectType: objectType as CommentObjectType,
  };
}

function CommentDrawerTriggers({
  children,
  disabled,
  openDrawer,
}: {
  children: CommentDrawerControllerProps["children"];
  disabled: boolean;
  openDrawer: (state: CommentDrawerState) => void;
}) {
  return children({
    disabled,
    openDrawer: (state) => {
      if (!disabled) openDrawer(state);
    },
  });
}

export function CommentDrawerController({
  children,
  projectId,
  initialState,
  mode = "read-write",
  count,
  onCommentChange,
}: CommentDrawerControllerProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const [isResolving, setIsResolving] = useState(false);
  const draftRef = useRef(false);
  const mentionDropdownRef = useRef(false);
  const setDraft = (hasDraft: boolean) => {
    draftRef.current = hasDraft;
  };
  const setMentionDropdown = (isOpen: boolean) => {
    mentionDropdownRef.current = isOpen;
  };
  const canClose = () => {
    if (mentionDropdownRef.current) return false;
    return !draftRef.current || window.confirm("Discard your unsent comment?");
  };

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "comments:read",
  });
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "comments:CUD",
  });
  const disabled =
    !hasReadAccess || (mode === "read-write" && !hasWriteAccess && !count);

  const clearCommentUrl = () => {
    if (router.query.comments === "open") {
      const { comments, commentObjectType, commentObjectId, ...rest } =
        router.query;
      router.replace({ pathname: router.pathname, query: rest }, undefined, {
        shallow: true,
      });
    }
  };
  const handleOpenChange = (open: boolean) => {
    if (!open && !canClose()) return false;
    if (!open) clearCommentUrl();
  };

  return (
    <DialogController<CommentDrawerState>
      onBeforeClose={canClose}
      onDismiss={clearCommentUrl}
      renderDialog={({ state, closeDialog }) => (
        <DialogContent className="overflow-visible" closeOnInteractionOutside>
          <DialogHeader>
            <DialogTitle>Add a comment</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <CommentComposer
              key={`${projectId}-${state.objectType}-${state.objectId}`}
              projectId={projectId}
              objectId={state.objectId}
              objectType={state.objectType}
              objectStartTime={state.objectStartTime}
              pendingSelection={
                state.type === "inline-comment" ? state.selection : null
              }
              onDraftChange={setDraft}
              onMentionDropdownChange={setMentionDropdown}
              onCommentCreated={async () => {
                await utils.comments.invalidate();
                Promise.resolve()
                  .then(() => onCommentChange?.())
                  .catch(() => undefined);
                closeDialog();
                clearCommentUrl();
              }}
            />
          </DialogBody>
        </DialogContent>
      )}
    >
      {({ openDialog }) => (
        <DrawerController<CommentDrawerState>
          initialState={disabled ? undefined : initialState}
          key={`${disabled ? "disabled" : "enabled"}-${router.isReady ? "ready" : "pending"}`}
          blockTextSelection={false}
          onOpenChange={handleOpenChange}
          renderContent={({ state, replaceState }) => (
            <CommentDrawerContent
              projectId={projectId}
              objectId={state.objectId}
              objectType={state.objectType}
              objectStartTime={state.objectStartTime}
              pendingSelection={
                state.type === "inline-comment" ? state.selection : null
              }
              onSelectionUsed={() =>
                replaceState({ ...state, type: "comments" })
              }
              onCommentChange={onCommentChange}
              onDraftChange={setDraft}
              onMentionDropdownChange={setMentionDropdown}
            />
          )}
        >
          {({ openDrawer }) => (
            <CommentDrawerTriggers
              disabled={disabled || isResolving}
              openDrawer={async (state) => {
                setIsResolving(true);
                try {
                  const comments = await utils.comments.getByObjectId.fetch({
                    projectId,
                    objectId: state.objectId,
                    objectType: state.objectType,
                  });
                  draftRef.current = false;
                  mentionDropdownRef.current = false;
                  if (comments.length === 0 && hasWriteAccess)
                    openDialog(state);
                  else openDrawer(state);
                } catch {
                  // The thread owns the query error and retry action.
                  openDrawer(state);
                } finally {
                  setIsResolving(false);
                }
              }}
            >
              {children}
            </CommentDrawerTriggers>
          )}
        </DrawerController>
      )}
    </DialogController>
  );
}
