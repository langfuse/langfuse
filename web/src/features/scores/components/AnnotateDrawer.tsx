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
}: AnnotateDrawerProps<Target>) {
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant={buttonVariant}
          disabled={!hasAccess}
          className="rounded-r-none"
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
            <LockIcon className="mr-1.5 h-3 w-3" />
          ) : (
            <SquarePen className="mr-1.5 h-4 w-4" />
          )}
          <span>Annotate</span>
        </Button>
      </DrawerTrigger>
      <DrawerContent className="p-3">
        <AnnotationForm
          serverScores={scores}
          scoreTarget={scoreTarget}
          analyticsData={analyticsData}
          scoreMetadata={scoreMetadata}
        />
      </DrawerContent>
    </Drawer>
  );
}
