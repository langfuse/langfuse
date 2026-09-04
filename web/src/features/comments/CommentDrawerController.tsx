import Header from "@/src/components/layouts/header";
import {
  Drawer,
  DrawerContent,
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
  isOpen: boolean;
  pendingSelection?: SelectionData | null;
  onSelectionUsed?: () => void;
  onCommentChange?: () => void | Promise<void>;
  onMentionDropdownChange: (isOpen: boolean) => void;
};

function CommentDrawerContent({
  projectId,
  objectId,
  objectType,
  isOpen,
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
          if (element && isOpen && !hasFocusedRef.current) {
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
            onMentionDropdownChange={onMentionDropdownChange}
            isDrawerOpen={isOpen}
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
  count?: number;
  pendingSelection?: SelectionData | null;
  onSelectionUsed?: () => void;
  onCommentChange?: () => void | Promise<void>;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: (control: {
    disabled: boolean;
    openDrawer: () => void;
  }) => ReactNode;
};

export function CommentDrawerController({
  children,
  projectId,
  objectId,
  objectType,
  count,
  pendingSelection,
  onSelectionUsed,
  onCommentChange,
  isOpen: controlledIsOpen,
  onOpenChange: controlledOnOpenChange,
}: CommentDrawerControllerProps) {
  const router = useRouter();
  const [isMentionDropdownOpen, setIsMentionDropdownOpen] = useState(false);
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const hasAutoOpenedRef = useRef(false);
  const isOpen = controlledIsOpen ?? internalIsOpen;
  const setIsOpen = controlledOnOpenChange ?? setInternalIsOpen;

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "comments:read",
  });
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "comments:CUD",
  });
  const disabled = !hasReadAccess || (!hasWriteAccess && !count);

  useEffect(() => {
    const shouldAutoOpen =
      router.query.comments === "open" &&
      router.query.commentObjectType === objectType &&
      router.query.commentObjectId === objectId &&
      hasReadAccess &&
      !isOpen &&
      !hasAutoOpenedRef.current;

    if (shouldAutoOpen) {
      hasAutoOpenedRef.current = true;
      setIsOpen(true);

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
  }, [
    router.query.comments,
    router.query.commentObjectType,
    router.query.commentObjectId,
    router.asPath,
    hasReadAccess,
    objectType,
    objectId,
    isOpen,
    setIsOpen,
  ]);

  const openDrawer = () => {
    if (!disabled) setIsOpen(true);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && isMentionDropdownOpen) return;

    setIsOpen(open);

    if (!open && router.query.comments === "open") {
      const { comments, commentObjectType, commentObjectId, ...rest } =
        router.query;
      router.replace({ pathname: router.pathname, query: rest }, undefined, {
        shallow: true,
      });
    }
  };

  return (
    <Drawer open={hasReadAccess && isOpen} onOpenChange={handleOpenChange}>
      {children({ disabled, openDrawer })}
      <CommentDrawerContent
        projectId={projectId}
        objectId={objectId}
        objectType={objectType}
        isOpen={isOpen}
        pendingSelection={pendingSelection}
        onSelectionUsed={onSelectionUsed}
        onCommentChange={onCommentChange}
        onMentionDropdownChange={setIsMentionDropdownOpen}
      />
    </Drawer>
  );
}
