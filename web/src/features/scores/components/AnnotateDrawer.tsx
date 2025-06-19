import React, { useState, useEffect } from "react";
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
import { AnnotateDrawerContent } from "@/src/features/scores/components/AnnotateDrawerContent";
import { useIsMutating } from "@tanstack/react-query";
import { z } from "zod/v4";
import { type AnnotateDrawerProps } from "@/src/features/scores/types";
import { type ScoreTarget } from "@/src/features/scores/types";
import { formatAnnotateDescription } from "@/src/features/scores/lib/helpers";

const mutationKeySchema = z.array(z.array(z.string()));

export function AnnotateDrawer<Target extends ScoreTarget>({
  scoreTarget,
  scores,
  emptySelectedConfigIds,
  setEmptySelectedConfigIds,
  projectId,
  analyticsData = {
    type: "trace",
    source: "TraceDetail",
  },
  variant = "button",
  buttonVariant = "secondary",
  hasGroupedButton = false,
  environment,
}: AnnotateDrawerProps<Target>) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showSaving, setShowSaving] = useState(false);
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

  // Validate if any of the scores mutations are in progress
  const isMutating = useIsMutating({
    predicate: (mutation) => {
      const mutationKey = mutation.options.mutationKey;

      const parsedMutationKey = mutationKeySchema.safeParse(mutationKey);
      if (!parsedMutationKey.success) return false;

      for (const key of parsedMutationKey.data) {
        const parsedKey = key.join(".");
        if (parsedKey === "scores.createAnnotationScore") return true;
        if (parsedKey === "scores.updateAnnotationScore") return true;
        if (parsedKey === "scores.deleteAnnotationScore") return true;
      }

      return false;
    },
  });

  useEffect(() => {
    if (isMutating > 0) {
      setShowSaving(true);
    } else {
      // Add delay before setting showSaving to ensure loading state persists for a short time after the mutation key indicates completion, allowing for any pending operations to finish
      const timer = setTimeout(() => {
        setShowSaving(false);
      }, 500); // 500ms delay

      return () => clearTimeout(timer);
    }
  }, [isMutating]);

  if (!hasAccess && variant === "badge") return null;

  return (
    <Drawer onClose={() => setIsDrawerOpen(false)}>
      <DrawerTrigger asChild>
        {variant === "button" ? (
          <Button
            variant={buttonVariant}
            disabled={!hasAccess || showSaving}
            className={hasGroupedButton ? "rounded-r-none" : ""}
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
            ) : showSaving ? (
              <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <SquarePen className="mr-1.5 h-4 w-4" />
            )}
            <span>Annotate</span>
          </Button>
        ) : (
          <Button
            className="h-6 rounded-full px-3 text-xs"
            disabled={!hasAccess || showSaving}
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
            Annotate
          </Button>
        )}
      </DrawerTrigger>
      <DrawerContent>
        {configsData.isLoading ? (
          <DrawerHeader className="sticky top-0 z-10 rounded-sm bg-background">
            <DrawerTitle>
              <Header
                title="Annotate"
                help={{
                  description,
                  href: "https://langfuse.com/docs/scores/manually",
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
          <AnnotateDrawerContent
            scores={scores}
            scoreTarget={scoreTarget}
            configs={configs}
            emptySelectedConfigIds={emptySelectedConfigIds}
            setEmptySelectedConfigIds={setEmptySelectedConfigIds}
            projectId={projectId}
            analyticsData={analyticsData}
            showSaving={showSaving}
            setShowSaving={setShowSaving}
            isDrawerOpen={isDrawerOpen}
            environment={environment}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}
