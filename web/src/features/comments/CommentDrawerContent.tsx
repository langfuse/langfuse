import Header from "@/src/components/layouts/header";
import {
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/src/components/ui/drawer";
import { CommentList } from "@/src/features/comments/CommentList";
import { type CommentObjectType } from "@langfuse/shared";
import { useRef } from "react";
import { type SelectionData } from "./contexts/InlineCommentSelectionContext";

export type CommentDrawerContentProps = {
  projectId: string;
  objectId: string;
  objectType: CommentObjectType;
  isOpen: boolean;
  pendingSelection?: SelectionData | null;
  onSelectionUsed?: () => void;
  onCommentChange?: () => void | Promise<void>;
  onMentionDropdownChange: (isOpen: boolean) => void;
};

export function CommentDrawerContent({
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
