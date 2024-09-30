import React, { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { LockIcon, SquarePen, LoaderCircle } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTrigger,
} from "@/src/components/ui/drawer";
import { AnnotationQueueObjectType, type APIScore } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import Header from "@/src/components/layouts/header";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { AnnotateDrawerContent } from "@/src/features/scores/components/AnnotateDrawerContent";
import { CreateNewAnnotationQueueItem } from "@/src/features/scores/components/CreateNewAnnotationQueueItem";
import { Separator } from "@/src/components/ui/separator";

export function AnnotateDrawer({
  traceId,
  scores,
  emptySelectedConfigIds,
  setEmptySelectedConfigIds,
  observationId,
  projectId,
  variant = "button",
  type = "trace",
  source = "TraceDetail",
}: {
  traceId: string;
  scores: APIScore[];
  emptySelectedConfigIds: string[];
  setEmptySelectedConfigIds: (ids: string[]) => void;
  observationId?: string;
  projectId: string;
  variant?: "button" | "badge";
  type?: "trace" | "observation" | "session";
  source?: "TraceDetail" | "SessionDetail";
}) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });

  const configsData = api.scoreConfigs.all.useQuery(
    {
      projectId,
    },
    {
      enabled: hasAccess && isDrawerOpen,
    },
  );

  const configs = configsData.data?.configs ?? [];

  if (!hasAccess && variant === "badge") return null;

  return (
    <Drawer onClose={() => setIsDrawerOpen(false)}>
      <DrawerTrigger asChild>
        {variant === "button" ? (
          <Button
            variant="secondary"
            disabled={!hasAccess}
            onClick={() => {
              setIsDrawerOpen(true);
              capture(
                Boolean(scores.length)
                  ? "score:update_form_open"
                  : "score:create_form_open",
                {
                  type: type,
                  source: source,
                },
              );
            }}
          >
            {!hasAccess ? (
              <LockIcon className="mr-1.5 h-3 w-3" />
            ) : (
              <SquarePen className="mr-1.5 h-4 w-4" />
            )}
            <span>Annotate</span>
            {type !== "session" && (
              <>
                <Separator
                  orientation="vertical"
                  className="ml-2 h-4 bg-secondary-foreground/20"
                />
                <CreateNewAnnotationQueueItem
                  projectId={projectId}
                  itemId={observationId ?? traceId}
                  itemType={
                    observationId
                      ? AnnotationQueueObjectType.OBSERVATION
                      : AnnotationQueueObjectType.TRACE
                  }
                />
              </>
            )}
          </Button>
        ) : (
          <Button
            className="h-6 rounded-full px-3 text-xs"
            disabled={!hasAccess}
            onClick={() => {
              setIsDrawerOpen(true);
              capture(
                Boolean(scores.length)
                  ? "score:update_form_open"
                  : "score:create_form_open",
                {
                  type: type,
                  source: source,
                },
              );
            }}
          >
            Annotate
          </Button>
        )}
      </DrawerTrigger>
      <DrawerContent className="h-1/3">
        {configsData.isLoading ? (
          <DrawerHeader className="sticky top-0 z-10 rounded-sm bg-background">
            <Header
              title="Annotate"
              level="h3"
              help={{
                description: `Annotate ${observationId ? "observation" : "trace"} with scores to capture human evaluation across different dimensions.`,
                href: "https://langfuse.com/docs/scores/manually",
              }}
            ></Header>
            <div className="flex min-h-[9rem] items-center justify-center rounded border border-dashed p-2">
              <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground opacity-60">
                Loading annotation data...
              </span>
            </div>
          </DrawerHeader>
        ) : (
          <AnnotateDrawerContent
            traceId={traceId}
            scores={scores}
            configs={configs}
            emptySelectedConfigIds={emptySelectedConfigIds}
            setEmptySelectedConfigIds={setEmptySelectedConfigIds}
            observationId={observationId}
            projectId={projectId}
            type={type}
            source={source}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}
