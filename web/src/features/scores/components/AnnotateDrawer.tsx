import React from "react";
import { Button } from "@/src/components/ui/button";
import { LockIcon, SquarePen } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@/src/components/ui/drawer";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type AnnotateDrawerProps } from "@/src/features/scores/types";
import { type ScoreTarget } from "@/src/features/scores/types";
import { AnnotationForm } from "@/src/features/scores/components/AnnotationForm";

export function AnnotateDrawer<Target extends ScoreTarget>({
  projectId,
  scoreTarget,
  scores,
  analyticsData = {
    type: "trace",
    source: "TraceDetail",
  },
  scoreMetadata,
  buttonVariant = "secondary",
  size = "default",
  layout = "toolbar",
}: AnnotateDrawerProps<Target> & {
  size?: "default" | "sm" | "xs" | "lg" | "icon" | "icon-xs" | "icon-sm";
  /**
   * "toolbar" (default) is the inline button; "menu" renders the same drawer
   * trigger as a full-width labeled row for the mobile header overflow popover.
   */
  layout?: "toolbar" | "menu";
}) {
  const isMenu = layout === "menu";
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });

  const hasNonAnnotationScores = scores.some(
    (score) => score.source !== "ANNOTATION",
  );

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant={isMenu ? "ghost" : buttonVariant}
          size={isMenu ? "sm" : size}
          disabled={!hasAccess}
          className={
            isMenu ? "w-full justify-start gap-2 font-normal" : "rounded-r-none"
          }
          onClick={() => {
            capture(
              Boolean(scores.length)
                ? "score:update_form_open"
                : "score:create_form_open",
              analyticsData,
            );
          }}
        >
          {!hasAccess ? (
            <LockIcon className={isMenu ? "h-3 w-3" : "mr-1.5 h-3 w-3"} />
          ) : (
            <SquarePen
              className={
                isMenu
                  ? "h-4 w-4"
                  : size === "sm"
                    ? "mr-1.5 h-3.5 w-3.5"
                    : "mr-1.5 h-4 w-4"
              }
            />
          )}
          <span className={isMenu ? "text-sm" : undefined}>Annotate</span>
        </Button>
      </DrawerTrigger>
      <DrawerContent className="p-3">
        <AnnotationForm
          serverScores={scores}
          scoreTarget={scoreTarget}
          analyticsData={analyticsData}
          scoreMetadata={scoreMetadata}
        />
        {hasNonAnnotationScores && (
          <div className="text-muted-foreground mt-4 text-xs">
            API and eval scores visible on left. Add manual annotations above.
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
