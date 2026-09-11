import Header from "@/src/components/layouts/header";
import {
  DrawerContent,
  DrawerController,
  DrawerHeader,
  DrawerTitle,
} from "@/src/components/ui/drawer";
import { CommentList } from "@/src/features/comments/CommentList";
import { useHasProjectAccess } from "@/src/features/rbac";
import { type CommentObjectType } from "@langfuse/shared";
import { useRouter } from "next/router";
import { type ReactNode, useEffect, useRef, useState } from "react";
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
}: CommentDrawerContentProps) {
  const hasFocusedRef = useRef(false);

  return (
    <DrawerContent
      overlayClassName="bg-primary/10"
      className="h-screen-with-banner max-h-screen-with-banner overflow-hidden"
    >
      <div
        className="mx-auto flex h-full w-full flex-col overflow-hidden focus:ring-0 focus:outline-hidden focus-visible:ring-0 focus-visible:outline-hidden md:max-h-full"
        tabIndex={-1}
        ref={(element) => {
          if (element && !hasFocusedRef.current) {
            hasFocusedRef.current = true;
            setTimeout(() => element.focus({ preventScroll: true }), 100);
          }
        }}
      >
        <DrawerHeader className="bg-background sr-only shrink-0 rounded-sm">
          <DrawerTitle>
            <Header title="Comments" />
          </DrawerTitle>
        </DrawerHeader>
        <div
          data-vaul-no-drag
          className="min-h-0 flex-1 overflow-hidden px-2 py-2"
        >
          <CommentList
            projectId={projectId}
            objectId={objectId}
            objectType={objectType}
            objectStartTime={objectStartTime}
            onMentionDropdownChange={onMentionDropdownChange}
            isDrawerOpen
            pendingSelection={pendingSelection}
            onSelectionUsed={onSelectionUsed}
            onCommentChange={onCommentChange}
          />
        </div>
      </div>
    </DrawerContent>
  );
}

export type CommentDrawerControllerProps = {
  projectId: string;
  objectId: string;
  objectType: CommentObjectType;
  objectStartTime?: Date | null;
  count?: number;
  onCommentChange?: () => void | Promise<void>;
  children: (control: {
    disabled: boolean;
    openDrawer: (state: CommentDrawerState) => void;
  }) => ReactNode;
};

type CommentDrawerState =
  | { type: "comments" }
  | { type: "inline-comment"; selection: SelectionData };

function CommentDrawerTriggers({
  children,
  disabled,
  isOpen,
  objectId,
  objectType,
  openDrawer,
}: {
  children: CommentDrawerControllerProps["children"];
  disabled: boolean;
  isOpen: boolean;
  objectId: string;
  objectType: CommentObjectType;
  openDrawer: (state: CommentDrawerState) => void;
}) {
  const router = useRouter();
  const hasAutoOpenedRef = useRef(false);

  useEffect(() => {
    const shouldAutoOpen =
      router.query.comments === "open" &&
      router.query.commentObjectType === objectType &&
      router.query.commentObjectId === objectId &&
      !disabled &&
      !isOpen &&
      !hasAutoOpenedRef.current;

    if (shouldAutoOpen) {
      hasAutoOpenedRef.current = true;
      openDrawer({ type: "comments" });

      if (router.asPath.includes("#comment-")) {
        setTimeout(() => {
          const hash = router.asPath.split("#")[1];
          document.getElementById(hash)?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 300);
      }
    }

    if (router.query.comments !== "open" && hasAutoOpenedRef.current) {
      hasAutoOpenedRef.current = false;
    }
  }, [disabled, isOpen, objectId, objectType, openDrawer, router]);

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
  objectId,
  objectType,
  objectStartTime,
  count,
  onCommentChange,
}: CommentDrawerControllerProps) {
  const router = useRouter();
  const [isMentionDropdownOpen, setIsMentionDropdownOpen] = useState(false);

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "comments:read",
  });
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "comments:CUD",
  });
  const disabled = !hasReadAccess || (!hasWriteAccess && !count);

  const handleOpenChange = (open: boolean) => {
    if (!open && isMentionDropdownOpen) return false;
    if (!open && router.query.comments === "open") {
      const { comments, commentObjectType, commentObjectId, ...rest } =
        router.query;
      router.replace({ pathname: router.pathname, query: rest }, undefined, {
        shallow: true,
      });
    }
  };

  return (
    <DrawerController<CommentDrawerState>
      key={hasReadAccess ? "allowed" : "denied"}
      blockTextSelection={false}
      onOpenChange={handleOpenChange}
      renderContent={({ state, replaceState }) => (
        <CommentDrawerContent
          projectId={projectId}
          objectId={objectId}
          objectType={objectType}
          objectStartTime={objectStartTime}
          pendingSelection={
            state.type === "inline-comment" ? state.selection : null
          }
          onSelectionUsed={() => replaceState({ type: "comments" })}
          onCommentChange={onCommentChange}
          onMentionDropdownChange={setIsMentionDropdownOpen}
        />
      )}
    >
      {({ isOpen, openDrawer }) => (
        <CommentDrawerTriggers
          disabled={disabled}
          isOpen={hasReadAccess && isOpen}
          objectId={objectId}
          objectType={objectType}
          openDrawer={openDrawer}
        >
          {children}
        </CommentDrawerTriggers>
      )}
    </DrawerController>
  );
}
