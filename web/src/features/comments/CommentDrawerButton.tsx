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
import React from "react";

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
  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "comments:read",
  });
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "comments:CUD",
  });

  if (!hasReadAccess || (!hasWriteAccess && !count))
    return (
      <Button type="button" variant="secondary" className={className} disabled>
        <MessageCircleOff className="h-4 w-4 text-muted-foreground" />
      </Button>
    );

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button type="button" variant={variant} className={className}>
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
        <div className="mx-auto w-full overflow-y-auto md:max-h-full">
          <DrawerHeader className="sticky top-0 z-10 rounded-sm bg-background">
            <DrawerTitle>
              <Header title="Comments"></Header>
            </DrawerTitle>
          </DrawerHeader>
          <div data-vaul-no-drag className="px-2">
            <CommentList
              projectId={projectId}
              objectId={objectId}
              objectType={objectType}
            />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
