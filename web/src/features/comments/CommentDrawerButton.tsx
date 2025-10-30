import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/src/components/ui/drawer";
import { CommentList } from "@/src/features/comments/CommentList";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type CommentObjectType } from "@langfuse/shared";
import { MessageCircleIcon, MessageCircleOff } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";

export function CommentDrawerButton({
  projectId,
  objectId,
  objectType,
  count,
  variant = "secondary",
  className,
}: {
  projectId: string;
  objectId: string;
  objectType: CommentObjectType;
  count?: number;
  variant?: "secondary" | "outline";
  className?: string;
}) {
  const router = useRouter();
  const [isMentionDropdownOpen, setIsMentionDropdownOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false); // Note: We manually control to keep the drawer open on ESC press when the mention dropdown is open
  const hasAutoOpenedRef = useRef(false); // Track if we've already auto-opened for current deep link
  const hasFocusedRef = useRef(false); // Track if we've already focused the drawer

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "comments:read",
  });
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "comments:CUD",
  });

  // Auto-open drawer when comments=open query param is present AND matches this drawer's object
  useEffect(() => {
    const shouldAutoOpen =
      router.query.comments === "open" &&
      router.query.commentObjectType === objectType &&
      router.query.commentObjectId === objectId &&
      hasReadAccess &&
      !isDrawerOpen &&
      !hasAutoOpenedRef.current;

    // Only open if drawer is not already open AND we haven't auto-opened yet for this deep link
    if (shouldAutoOpen) {
      hasAutoOpenedRef.current = true;
      setIsDrawerOpen(true);

      // Scroll to specific comment if hash is present
      if (router.asPath.includes("#comment-")) {
        // Wait for drawer animation to complete before scrolling
        setTimeout(() => {
          const hash = router.asPath.split("#")[1];
          const element = document.getElementById(hash);
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 300);
      }
    }

    // Reset the flag when query params are cleared (user navigated away from deep link)
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
    isDrawerOpen,
  ]);

  if (!hasReadAccess || (!hasWriteAccess && !count))
    return (
      <Button type="button" variant="secondary" className={className} disabled>
        <MessageCircleOff className="h-4 w-4 text-muted-foreground" />
      </Button>
    );

  return (
    <Drawer
      open={isDrawerOpen}
      onOpenChange={(open) => {
        // Prevent drawer from closing when mention dropdown is open
        if (!open && isMentionDropdownOpen) {
          // Keep drawer open
          return;
        }
        setIsDrawerOpen(open);

        // Reset focus tracking when drawer closes
        if (!open) {
          hasFocusedRef.current = false;
        }

        // Clear URL parameters and hash when drawer is closed
        if (!open && router.query.comments === "open") {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { comments, commentObjectType, commentObjectId, ...rest } =
            router.query;
          router.replace(
            {
              pathname: router.pathname,
              query: rest,
            },
            undefined,
            { shallow: true },
          );
        }
      }}
    >
      <DrawerTrigger asChild>
        <Button
          type="button"
          variant={variant}
          className={className}
          id="comment-drawer-button"
        >
          {!!count ? (
            <div className="flex items-center gap-1">
              <MessageCircleIcon className="h-4 w-4" />
              <span className="flex h-3.5 w-fit items-center justify-center rounded-sm bg-primary/50 px-1 text-xs text-primary-foreground shadow-sm">
                {count > 99 ? "99+" : count}
              </span>
            </div>
          ) : (
            <MessageCircleIcon className="h-4 w-4" />
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent overlayClassName="bg-primary/10">
        <div
          className="mx-auto flex h-full w-full flex-col overflow-hidden focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 md:max-h-full"
          tabIndex={-1}
          ref={(el) => {
            // Auto-focus drawer content when it opens (only once)
            if (el && isDrawerOpen && !hasFocusedRef.current) {
              hasFocusedRef.current = true;
              setTimeout(() => el.focus({ preventScroll: true }), 100);
            }
          }}
        >
          <DrawerHeader className="sr-only flex-shrink-0 rounded-sm bg-background">
            <DrawerTitle>
              <Header title="Comments"></Header>
            </DrawerTitle>
          </DrawerHeader>
          <div data-vaul-no-drag className="min-h-0 flex-1 px-2 pt-2">
            <CommentList
              projectId={projectId}
              objectId={objectId}
              objectType={objectType}
              onMentionDropdownChange={setIsMentionDropdownOpen}
              isDrawerOpen={isDrawerOpen}
            />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
