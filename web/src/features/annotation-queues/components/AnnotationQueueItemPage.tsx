import { Card } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import {
  AnnotationQueueStatus,
  AnnotationQueueObjectType,
} from "@langfuse/shared";
import { ArrowLeft, ArrowRight, Keyboard, SearchXIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "zustand";
import {
  createAnnotationQueueRun,
  type AnnotationQueueRun,
  type QueueRunDependencies,
} from "../state/annotationQueueRun";
import { Button } from "@/src/components/ui/button";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { cn } from "@/src/utils/tailwind";
import {
  hasModifier,
  isCompleteShortcut,
  isInteractiveTarget,
  isOpenDialogPresent,
  isTypingTarget,
} from "@/src/features/scores";
import { useAnnotationQueueData } from "./shared/hooks/useAnnotationQueueData";
import { useAnnotationObjectData } from "./shared/hooks/useAnnotationObjectData";
import { TraceAnnotationProcessor } from "./processors/TraceAnnotationProcessor";
import { SessionAnnotationProcessor } from "./processors/SessionAnnotationProcessor";
import { ObjectNotFoundCard } from "@/src/features/annotation-queues/components/object-not-found-card";
import { useSession } from "next-auth/react";
import { SplashScreen } from "@/src/components/ui/splash-screen";

// A single row in the keyboard-shortcuts cheatsheet: label on the left, one or
// more <KeyboardShortcut> glyphs on the right.
const ShortcutRow: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-6 py-1.5">
    <span className="text-sm">{label}</span>
    <span className="hidden items-center gap-1 md:flex">{children}</span>
  </div>
);

type QueuePageProps = {
  annotationQueueId: string;
  projectId: string;
  queryItemId?: string;
};

export function AnnotationQueueItemPage(props: QueuePageProps) {
  const router = useRouter();
  const { status } = useSession();
  if (!router.isReady) return <Skeleton className="h-full w-full" />;
  const singleItem = router.query.singleItem === "true";
  return (
    <AnnotationQueueRunLoader
      key={singleItem ? props.queryItemId : "run"}
      {...props}
      singleItem={singleItem}
      sessionReady={status !== "loading"}
    />
  );
}

function AnnotationQueueRunLoader({
  annotationQueueId,
  projectId,
  queryItemId,
  singleItem,
  sessionReady,
}: QueuePageProps & { singleItem: boolean; sessionReady: boolean }) {
  const router = useRouter();
  const runId = useId();
  const queryClient = useQueryClient();
  const queryKey = ["annotation-queue-run", runId];
  const [run] = useState(() =>
    createAnnotationQueueRun({ initialItemId: queryItemId, singleItem }),
  );
  const utils = api.useUtils();
  const fetchNext = api.annotationQueues.fetchAndLockNext.useMutation();
  const complete = api.annotationQueueItems.complete.useMutation();
  const dependencies: QueueRunDependencies = {
    isActive: () =>
      queryClient.getQueryCache().find({ queryKey })?.isActive() ?? false,
    loadItem: (itemId) =>
      utils.annotationQueueItems.byId.fetch({ projectId, itemId }),
    loadNext: async (seenItemIds) => {
      const item = await fetchNext.mutateAsync({
        queueId: annotationQueueId,
        projectId,
        seenItemIds,
      });
      return item
        ? {
            ...item,
            lockedByUser: { name: item.lockedByUser.name ?? null },
          }
        : null;
    },
    cacheItem: (item) =>
      utils.annotationQueueItems.byId.setData(
        { projectId, itemId: item.id },
        item,
      ),
    completeItem: (itemId) => complete.mutateAsync({ projectId, itemId }),
    refreshItems: () => utils.annotationQueueItems.invalidate(),
    navigate: async (item, initialize) => {
      if (initialize && router.query.itemId === item.id) {
        if (item.observationId && !router.query.observation) {
          await router.replace(
            {
              pathname: router.pathname,
              query: { ...router.query, observation: item.observationId },
            },
            undefined,
            { shallow: true },
          );
        }
        return;
      }
      await router.push({
        pathname: `/project/${projectId}/annotation-queues/${annotationQueueId}/items/${item.id}`,
        query: item.observationId
          ? { observation: item.observationId }
          : undefined,
      });
    },
  };
  const bootstrap = useQuery({
    queryKey,
    queryFn: ({ signal }) => run.actions.start(dependencies, signal),
    enabled: sessionReady,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (bootstrap.isPending) return <Skeleton className="h-full w-full" />;
  if (bootstrap.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p>Unable to load the annotation queue.</p>
        <Button onClick={() => bootstrap.refetch()}>Try again</Button>
      </div>
    );
  }
  return (
    <AnnotationQueueRunContent
      annotationQueueId={annotationQueueId}
      projectId={projectId}
      isSingleItem={singleItem}
      run={run}
      dependencies={dependencies}
    />
  );
}

function AnnotationQueueRunContent({
  annotationQueueId,
  projectId,
  isSingleItem,
  run,
  dependencies,
}: {
  annotationQueueId: string;
  projectId: string;
  isSingleItem: boolean;
  run: AnnotationQueueRun;
  dependencies: QueueRunDependencies;
}) {
  const { history, progressIndex, isTransitioning, exhausted } = useStore(
    run.store,
  );
  const seenItemIds = history.map((item) => item.id);
  const itemId = history[progressIndex]?.id;
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });
  const seenItemData = api.annotationQueueItems.byId.useQuery(
    { projectId, itemId: itemId as string },
    { enabled: !!itemId, refetchOnMount: false },
  );
  const { configs } = useAnnotationQueueData({ annotationQueueId, projectId });
  const unseenPendingItemCount =
    api.annotationQueueItems.unseenPendingItemCountByQueueId.useQuery(
      { queueId: annotationQueueId, projectId, seenItemIds },
      { refetchOnWindowFocus: false },
    );
  const totalItems =
    seenItemIds.length + (exhausted ? 0 : (unseenPendingItemCount.data ?? 0));
  const relevantItem = seenItemData.data;
  const objectData = useAnnotationObjectData(relevantItem ?? null, projectId);
  const isNextItemAvailable = totalItems > progressIndex + 1;
  const isPending = relevantItem?.status === AnnotationQueueStatus.PENDING;
  const handleNavigateBack = useCallback(
    () => run.actions.back(dependencies),
    [run, dependencies],
  );
  const handleNavigateNext = useCallback(
    () => run.actions.next(dependencies),
    [run, dependencies],
  );
  const handleComplete = useCallback(
    () => run.actions.complete(dependencies),
    [run, dependencies],
  );

  // Brief highlight on the button when its shortcut fires.
  const [shortcutPulse, setShortcutPulse] = useState<
    "back" | "next" | "complete" | null
  >(null);
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulse = useCallback((which: "back" | "next" | "complete") => {
    if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    setShortcutPulse(which);
    pulseTimeoutRef.current = setTimeout(() => setShortcutPulse(null), 160);
  }, []);
  useEffect(
    () => () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    },
    [],
  );

  // "?" opens a keyboard-shortcuts cheatsheet.
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    if (isSingleItem) return; // single-item view has no queue navigation
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!hasAccess) return;
      // Mirror the Skeleton gate below, and also bail while a complete is in
      // flight: this listener stays attached while the current/next item is
      // loading, so a held or repeated key during the post-complete fetch must
      // not complete or skip an item the annotator hasn't actually seen yet
      // (e.g. a quick → between ⌘/Ctrl+Enter and onSuccess advancing would skip
      // the next item, which only flashed as a Skeleton).
      if (objectData.isLoading || isTransitioning) return;

      // Complete + next — the Cmd/Ctrl+Enter submit chord. Handled first and
      // *before* the typing guard so it works even while the annotator is in the
      // multi-line Feedback field (bare Enter there stays a newline). Defer to an
      // open drawer/dialog so it never steals that surface's own submit.
      if (isCompleteShortcut(event)) {
        if (isOpenDialogPresent()) return;
        if (isPending && !isTransitioning && !objectData.isError) {
          event.preventDefault();
          // An out-of-range numeric score is vetoed on blur (no mutation fires),
          // so completing now would silently drop it. Scan *all* numeric score
          // inputs — not just the focused one — because the invalid value stays
          // in the DOM after Tabbing away (`:invalid` = native min/max overflow;
          // step="any" keeps decimals valid, mirroring validateNumericScore).
          const invalidNumber = document.querySelector<HTMLInputElement>(
            '[data-annotation-form] input[type="number"]:invalid',
          );
          if (invalidNumber) {
            invalidNumber.focus();
            invalidNumber.reportValidity();
            return;
          }
          // Text/numeric score fields persist on blur. Flush a focused one first
          // so feedback typed right before ⌘/Ctrl+Enter isn't lost when we
          // navigate away (its onBlur fires the save mutation synchronously).
          const active = document.activeElement;
          if (
            active instanceof HTMLTextAreaElement ||
            active instanceof HTMLInputElement
          ) {
            active.blur();
          }
          pulse("complete");
          handleComplete().catch(() => {});
        }
        return;
      }

      // "?" — open the shortcuts cheatsheet.
      if (event.key === "?") {
        if (
          isTypingTarget(event.target) ||
          hasModifier(event) ||
          isOpenDialogPresent()
        )
          return;
        event.preventDefault();
        setShowShortcuts(true);
        return;
      }

      // The remaining shortcuts are bare keys: bail if another listener already
      // handled the event, while typing, on a held modifier, when a focusable
      // control / roving-focus widget owns the key, or while a dialog is open.
      if (isTypingTarget(event.target) || hasModifier(event)) return;
      if (
        isInteractiveTarget(event.target) ||
        isInteractiveTarget(document.activeElement) ||
        isOpenDialogPresent()
      )
        return;

      // Don't hijack Alt+←/→ — that's the browser's back/forward on
      // Windows/Linux/ChromeOS (hasModifier lets altKey through for AltGr-typed
      // printables, but arrow keys are never AltGr-produced).
      if (event.altKey) return;

      // Next item (skip — no completion).
      if (event.key === "ArrowRight") {
        if (isNextItemAvailable) {
          event.preventDefault();
          pulse("next");
          handleNavigateNext().catch(() => {});
        }
        return;
      }
      // Previous item.
      if (event.key === "ArrowLeft") {
        if (progressIndex > 0) {
          event.preventDefault();
          pulse("back");
          handleNavigateBack().catch(() => {});
        }
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isSingleItem,
    hasAccess,
    isPending,
    isNextItemAvailable,
    progressIndex,
    isTransitioning,
    objectData.isError,
    objectData.isLoading,
    handleComplete,
    handleNavigateNext,
    handleNavigateBack,
    pulse,
  ]);

  if (
    (seenItemData.isPending && itemId) ||
    (isTransitioning && !itemId) ||
    unseenPendingItemCount.isPending ||
    objectData.isLoading
  ) {
    return <Skeleton className="h-full w-full" />;
  }

  if (!relevantItem && !(itemId && seenItemIds.includes(itemId))) {
    return (
      <SplashScreen
        title="All queue items processed"
        description="There are no more items left to annotate."
      />
    );
  }

  const renderContent = () => {
    // Handle deleted object (trace/observation/session not found)
    if (objectData.isError && objectData.errorCode === "NOT_FOUND") {
      return (
        <ObjectNotFoundCard
          type={relevantItem?.objectType ?? AnnotationQueueObjectType.TRACE}
        />
      );
    }

    // Handle deleted queue item
    if (!relevantItem) {
      return (
        <Card className="flex h-full w-full flex-col items-center justify-center overflow-hidden border-none">
          <SearchXIcon className="text-muted-foreground mb-2 h-8 w-8" />
          <span className="text-muted-foreground max-w-96 text-sm text-wrap">
            Item has been <strong>deleted from annotation queue</strong>.
            Previously added scores and underlying reference trace are
            unaffected by this action.
          </span>
        </Card>
      );
    }

    switch (relevantItem.objectType) {
      case AnnotationQueueObjectType.TRACE:
      case AnnotationQueueObjectType.OBSERVATION:
        return (
          <TraceAnnotationProcessor
            item={relevantItem}
            data={objectData.data}
            configs={configs}
            projectId={projectId}
          />
        );
      case AnnotationQueueObjectType.SESSION:
        return (
          <SessionAnnotationProcessor
            item={relevantItem}
            data={objectData.data}
            configs={configs}
            projectId={projectId}
          />
        );
      default:
        throw new Error(`Unsupported object type: ${relevantItem.objectType}`);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {renderContent()}
      </div>
      <div className="grid w-full shrink-0 grid-cols-1 justify-end gap-2 py-2 sm:grid-cols-[auto_min-content]">
        {!isSingleItem && (
          <div className="flex max-h-10 flex-row items-center gap-2">
            <span className="bg-muted grid h-9 min-w-16 items-center rounded-md p-1 text-center text-sm">
              {progressIndex + 1} / {totalItems}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => handleNavigateBack().catch(() => {})}
                  variant="outline"
                  disabled={
                    progressIndex === 0 || !hasAccess || isTransitioning
                  }
                  size="lg"
                  className={cn(
                    "gap-1.5 px-4 transition-colors duration-150",
                    shortcutPulse === "back" &&
                      "border-primary/60 bg-accent/60 ring-primary/20 ring-2",
                  )}
                  aria-label="Previous item"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden md:inline-flex">
                    <KeyboardShortcut keys={["ArrowLeft"]} />
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span>Previous item</span>
                <span className="ml-2 hidden md:inline-flex">
                  <KeyboardShortcut keys={["ArrowLeft"]} />
                </span>
              </TooltipContent>
            </Tooltip>
            {/* Shortcut legend so annotators can discover keyboard-first flow */}
            <span className="text-muted-foreground hidden items-center gap-1.5 pl-1 text-[11px] lg:flex">
              <KeyboardShortcut size="sm" keys={["Mod", "Enter"]} />
              complete + next ·
              <KeyboardShortcut size="sm" keys={["ArrowRight"]} />
              skip
            </span>
            <button
              type="button"
              onClick={() => setShowShortcuts(true)}
              className="text-muted-foreground hover:text-foreground hidden items-center gap-1 text-[11px] transition-colors lg:flex"
              aria-label="Show keyboard shortcuts"
            >
              <KeyboardShortcut size="sm" keys={["?"]} />
              shortcuts
            </button>
          </div>
        )}
        <div className="flex w-full min-w-[265px] items-center justify-end gap-2">
          {!isSingleItem && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => handleNavigateNext().catch(() => {})}
                  disabled={
                    !isNextItemAvailable || !hasAccess || isTransitioning
                  }
                  size="lg"
                  className={cn(
                    "gap-1.5 px-4 transition-colors duration-150",
                    !relevantItem ? "w-full" : "",
                    shortcutPulse === "next" &&
                      "border-primary/60 bg-accent/60 ring-primary/20 ring-2",
                  )}
                  variant="outline"
                  aria-label="Skip to next item"
                >
                  <ArrowRight className="h-4 w-4" />
                  <span className="hidden md:inline-flex">
                    <KeyboardShortcut keys={["ArrowRight"]} />
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span>Skip to next item</span>
                <span className="ml-2 hidden md:inline-flex">
                  <KeyboardShortcut keys={["ArrowRight"]} />
                </span>
              </TooltipContent>
            </Tooltip>
          )}
          {!!relevantItem &&
            (relevantItem.status === AnnotationQueueStatus.PENDING ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => handleComplete().catch(() => {})}
                    size="lg"
                    className={cn(
                      "mr-2 w-full gap-1.5 transition-colors duration-150",
                      shortcutPulse === "complete" && "ring-primary/40 ring-2",
                    )}
                    disabled={
                      isTransitioning || !hasAccess || objectData.isError
                    }
                  >
                    <span>Mark Completed</span>
                    {!isSingleItem && (
                      <span className="hidden md:inline-flex">
                        <KeyboardShortcut
                          variant="inverse"
                          keys={["Mod", "Enter"]}
                        />
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <span>
                    {isSingleItem
                      ? "Mark completed"
                      : "Mark completed + go to next item"}
                  </span>
                  {!isSingleItem && (
                    <span className="ml-2 hidden md:inline-flex">
                      <KeyboardShortcut keys={["Mod", "Enter"]} />
                    </span>
                  )}
                </TooltipContent>
              </Tooltip>
            ) : (
              <div className="border-dark-green bg-light-green inline-flex h-9 w-full items-center justify-center rounded-md border px-8 text-sm font-bold">
                Completed
              </div>
            ))}
        </div>
      </div>
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Keyboard className="h-4 w-4" />
              Keyboard shortcuts
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="gap-4 py-3">
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-bold tracking-wide uppercase">
                Navigate
              </p>
              <ShortcutRow label="Complete & go to next item">
                <KeyboardShortcut size="sm" keys={["Mod", "Enter"]} />
              </ShortcutRow>
              <ShortcutRow label="Skip to next item">
                <KeyboardShortcut size="sm" keys={["ArrowRight"]} />
              </ShortcutRow>
              <ShortcutRow label="Previous item">
                <KeyboardShortcut size="sm" keys={["ArrowLeft"]} />
              </ShortcutRow>
            </div>
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-bold tracking-wide uppercase">
                Score the item
              </p>
              <ShortcutRow label="Move between score fields">
                <KeyboardShortcut size="sm" keys={["ArrowUp"]} />
                <KeyboardShortcut size="sm" keys={["ArrowDown"]} />
              </ShortcutRow>
              <ShortcutRow label="Select an option on the focused field">
                <KeyboardShortcut size="sm" keys={["1"]} />
                <span className="text-muted-foreground text-xs">–</span>
                <KeyboardShortcut size="sm" keys={["9"]} />
              </ShortcutRow>
              <ShortcutRow label="Edit a field / open a dropdown">
                <KeyboardShortcut size="sm" keys={["Enter"]} />
              </ShortcutRow>
              <ShortcutRow label="Commit a number / leave a text field">
                <KeyboardShortcut size="sm" keys={["Escape"]} />
                <span className="text-muted-foreground text-xs">/</span>
                <KeyboardShortcut size="sm" keys={["Tab"]} />
              </ShortcutRow>
            </div>
            <p className="text-muted-foreground border-t pt-3 text-xs">
              Bare{" "}
              <span className="hidden md:inline-flex">
                <KeyboardShortcut size="sm" keys={["Enter"]} />
              </span>{" "}
              inside a text field (e.g. Feedback) inserts a new line — use{" "}
              <span className="hidden md:inline-flex">
                <KeyboardShortcut size="sm" keys={["Mod", "Enter"]} />
              </span>{" "}
              to complete.
            </p>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
