import { Drawer } from "@/src/components/ui/drawer";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type CommentObjectType } from "@langfuse/shared";
import { useRouter } from "next/router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { CommentDrawerContent } from "./CommentDrawerContent";
import { type SelectionData } from "./contexts/InlineCommentSelectionContext";

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
