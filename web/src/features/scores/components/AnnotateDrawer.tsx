import React, { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { LockIcon, SquarePen, LoaderCircle } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/src/components/ui/drawer";
import { api } from "@/src/utils/api";
import Header from "@/src/components/layouts/header";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type AnnotateDrawerProps } from "@/src/features/scores/types";
import { type ScoreTarget } from "@/src/features/scores/types";
import { formatAnnotateDescription } from "@/src/features/scores/lib/helpers";
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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });
  const description = formatAnnotateDescription(scoreTarget);

  const configsData = api.scoreConfigs.all.useQuery(
    {
      projectId,
    },
    {
      enabled: hasAccess && isDrawerOpen,
    },
  );

  const configs = configsData.data?.configs ?? [];

  if (!hasAccess) return null;

  return (
    <Drawer onClose={() => setIsDrawerOpen(false)}>
      <DrawerTrigger asChild>
        <Button
          variant={buttonVariant}
          disabled={!hasAccess}
          className="rounded-r-none"
          onClick={() => {
            setIsDrawerOpen(true);
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
      <DrawerContent>
        {configsData.isLoading ? (
          <DrawerHeader className="sticky top-0 z-10 rounded-sm bg-background">
            <DrawerTitle>
              <Header
                title="Annotate"
                help={{
                  description,
                  href: "https://langfuse.com/docs/evaluation/evaluation-methods/annotation",
                }}
              ></Header>
            </DrawerTitle>
            <div className="flex min-h-[9rem] items-center justify-center rounded border border-dashed p-2">
              <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground opacity-60">
                Loading annotation data...
              </span>
            </div>
          </DrawerHeader>
        ) : (
          <AnnotationForm
            serverScores={scores}
            scoreTarget={scoreTarget}
            configs={configs}
            analyticsData={analyticsData}
            scoreMetadata={scoreMetadata}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}
