import { Card } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import {
  AnnotationQueueStatus,
  AnnotationQueueObjectType,
} from "@langfuse/shared";
import { ArrowLeft, ArrowRight, Keyboard, SearchXIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { KeyboardShortcut } from "@/src/components/ui/keyboard-shortcut";
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
  isAppleDevice,
  isCompleteShortcut,
  isInteractiveTarget,
  isOpenDialogPresent,
  isTypingTarget,
} from "@/src/features/scores/lib/keyboardShortcuts";
import { useAnnotationQueueData } from "./shared/hooks/useAnnotationQueueData";
import { useAnnotationObjectData } from "./shared/hooks/useAnnotationObjectData";
import { TraceAnnotationProcessor } from "./processors/TraceAnnotationProcessor";
import { SessionAnnotationProcessor } from "./processors/SessionAnnotationProcessor";
import { ObjectNotFoundCard } from "@/src/components/ui/object-not-found-card";
import { useSession } from "next-auth/react";

// A single row in the keyboard-shortcuts cheatsheet: label on the left, one or
// more <KeyboardShortcut> glyphs (passed as children) on the right.
const ShortcutRow: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-6 py-1.5">
    <span className="text-sm">{label}</span>
    <span className="flex items-center gap-1">{children}</span>
  </div>
);

export const AnnotationQueueItemPage: React.FC<{
  annotationQueueId: string;
  projectId: string;
  queryItemId?: string;
}> = ({ annotationQueueId, projectId, queryItemId }) => {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const sessionLoaded = sessionStatus !== "loading";
  const isSingleItem = router.query.singleItem === "true";
  const [nextItemData, setNextItemData] = useState<
    RouterOutput["annotationQueues"]["fetchAndLockNext"] | null
  >(null);
  const [seenItemIds, setSeenItemIds] = useState<string[]>([]);
  const [progressIndex, setProgressIndex] = useState(0);

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });

  const itemId = isSingleItem ? queryItemId : seenItemIds[progressIndex];

  const seenItemData = api.annotationQueueItems.byId.useQuery(
    { projectId, itemId: itemId as string },
    { enabled: !!itemId && sessionLoaded, refetchOnMount: false },
  );

  const fetchAndLockNextMutation =
    api.annotationQueues.fetchAndLockNext.useMutation();

  // Effects
  useEffect(() => {
    async function fetchNextItem() {
      if (!itemId && !isSingleItem && sessionLoaded) {
        const nextItem = await fetchAndLockNextMutation.mutateAsync({
          queueId: annotationQueueId,
          projectId,
          seenItemIds,
        });
        setNextItemData(nextItem);
      }
    }
    fetchNextItem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoaded]);
  const { configs } = useAnnotationQueueData({ annotationQueueId, projectId });

  const unseenPendingItemCount =
    api.annotationQueueItems.unseenPendingItemCountByQueueId.useQuery(
      {
        queueId: annotationQueueId,
        projectId,
        seenItemIds,
      },
      { refetchOnWindowFocus: false },
    );

  const utils = api.useUtils();
  const completeMutation = api.annotationQueueItems.complete.useMutation({
    onSuccess: async () => {
      utils.annotationQueueItems.invalidate();
      if (isSingleItem) {
        return;
      }

      if (progressIndex >= seenItemIds.length - 1) {
        const nextItem = await fetchAndLockNextMutation.mutateAsync({
          queueId: annotationQueueId,
          projectId,
          seenItemIds,
        });
        setNextItemData(nextItem);
      }

      if (progressIndex + 1 < totalItems) {
        setProgressIndex(Math.max(progressIndex + 1, 0));
      }
    },
  });

  const totalItems = useMemo(() => {
    return seenItemIds.length + (unseenPendingItemCount.data ?? 0);
  }, [unseenPendingItemCount.data, seenItemIds.length]);

  const relevantItem = useMemo(() => {
    if (isSingleItem) return seenItemData.data;
    return progressIndex < seenItemIds.length
      ? seenItemData.data
      : nextItemData;
  }, [
    progressIndex,
    seenItemIds.length,
    seenItemData.data,
    nextItemData,
    isSingleItem,
  ]);

  const objectData = useAnnotationObjectData(relevantItem ?? null, projectId);

  useEffect(() => {
    if (relevantItem?.id && router.query.itemId !== relevantItem.id) {
      const observation =
        relevantItem.objectType === AnnotationQueueObjectType.OBSERVATION
          ? relevantItem.objectId
          : undefined;
      router.push(
        {
          pathname: `/project/${projectId}/annotation-queues/${annotationQueueId}/items/${relevantItem.id}`,
          query: observation ? { observation } : undefined,
        },
        undefined,
      );
    }
  }, [relevantItem, router, projectId, annotationQueueId]);

  useEffect(() => {
    if (
      relevantItem &&
      !seenItemIds.includes(relevantItem.id) &&
      !isSingleItem
    ) {
      setSeenItemIds((prev) => [...prev, relevantItem.id]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevantItem]);

  const isNextItemAvailable = totalItems > progressIndex + 1;
  const isPending = relevantItem?.status === AnnotationQueueStatus.PENDING;

  // LFE-7628 — keyboard-first navigation/completion.
  const handleNavigateBack = useCallback(() => {
    setProgressIndex((prev) => prev - 1);
  }, []);

  const handleNavigateNext = useCallback(async () => {
    if (progressIndex >= seenItemIds.length - 1) {
      const nextItem = await fetchAndLockNextMutation.mutateAsync({
        queueId: annotationQueueId,
        projectId,
        seenItemIds,
      });
      setNextItemData(nextItem);
    }
    setProgressIndex(Math.max(progressIndex + 1, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressIndex, seenItemIds, annotationQueueId, projectId]);

  const handleComplete = useCallback(async () => {
    if (!relevantItem) return;
    await completeMutation.mutateAsync({
      itemId: relevantItem.id,
      projectId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevantItem?.id, projectId]);

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

  // Platform-aware modifier glyph for the complete chord (⌘ on macOS, Ctrl else).
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(isAppleDevice());
  }, []);
  const modLabel = isMac ? "⌘" : "Ctrl";

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
      if (
        objectData.isLoading ||
        fetchAndLockNextMutation.isPending ||
        completeMutation.isPending
      )
        return;

      // Complete + next — the Cmd/Ctrl+Enter submit chord. Handled first and
      // *before* the typing guard so it works even while the annotator is in the
      // multi-line Feedback field (bare Enter there stays a newline). Defer to an
      // open drawer/dialog so it never steals that surface's own submit.
      if (isCompleteShortcut(event)) {
        if (isOpenDialogPresent()) return;
        if (isPending && !completeMutation.isPending && !objectData.isError) {
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
          handleNavigateBack();
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
    completeMutation.isPending,
    objectData.isError,
    objectData.isLoading,
    fetchAndLockNextMutation.isPending,
    handleComplete,
    handleNavigateNext,
    handleNavigateBack,
    pulse,
  ]);

  if (
    (seenItemData.isPending && itemId) ||
    (fetchAndLockNextMutation.isPending && !itemId) ||
    unseenPendingItemCount.isPending ||
    objectData.isLoading ||
    (!sessionLoaded && !isSingleItem)
  ) {
    return <Skeleton className="h-full w-full" />;
  }

  if (!relevantItem && !(itemId && seenItemIds.includes(itemId))) {
    return <div>No more items left to annotate!</div>;
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
                  onClick={handleNavigateBack}
                  variant="outline"
                  disabled={progressIndex === 0 || !hasAccess}
                  size="lg"
                  className={cn(
                    "gap-1.5 px-4 transition-colors duration-150",
                    shortcutPulse === "back" &&
                      "border-primary/60 bg-accent/60 ring-primary/20 ring-2",
                  )}
                  aria-label="Previous item"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <KeyboardShortcut>←</KeyboardShortcut>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span>Previous item</span>
                <KeyboardShortcut className="ml-2">←</KeyboardShortcut>
              </TooltipContent>
            </Tooltip>
            {/* Shortcut legend so annotators can discover keyboard-first flow */}
            <span className="text-muted-foreground hidden items-center gap-1.5 pl-1 text-[11px] lg:flex">
              <KeyboardShortcut
                className="h-4 px-1 text-[9px]"
                keys={[modLabel, "↵"]}
              />
              complete + next ·
              <KeyboardShortcut className="h-4 min-w-4 px-1 text-[9px]">
                →
              </KeyboardShortcut>
              skip
            </span>
            <button
              type="button"
              onClick={() => setShowShortcuts(true)}
              className="text-muted-foreground hover:text-foreground hidden items-center gap-1 text-[11px] transition-colors lg:flex"
              aria-label="Show keyboard shortcuts"
            >
              <KeyboardShortcut className="h-4 min-w-4 px-1 text-[9px]">
                ?
              </KeyboardShortcut>
              shortcuts
            </button>
          </div>
        )}
        <div className="flex w-full min-w-[265px] items-center justify-end gap-2">
          {!isSingleItem && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleNavigateNext}
                  disabled={!isNextItemAvailable || !hasAccess}
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
                  <KeyboardShortcut>→</KeyboardShortcut>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span>Skip to next item</span>
                <KeyboardShortcut className="ml-2">→</KeyboardShortcut>
              </TooltipContent>
            </Tooltip>
          )}
          {!!relevantItem &&
            (relevantItem.status === AnnotationQueueStatus.PENDING ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleComplete}
                    size="lg"
                    className={cn(
                      "mr-2 w-full gap-1.5 transition-colors duration-150",
                      shortcutPulse === "complete" && "ring-primary/40 ring-2",
                    )}
                    disabled={
                      completeMutation.isPending ||
                      !hasAccess ||
                      objectData.isError
                    }
                  >
                    <span>Mark Completed</span>
                    {!isSingleItem && (
                      <KeyboardShortcut
                        className="bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30"
                        keys={[modLabel, "↵"]}
                      />
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
                    <KeyboardShortcut className="ml-2" keys={[modLabel, "↵"]} />
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
                <KeyboardShortcut keys={[modLabel, "↵"]} />
              </ShortcutRow>
              <ShortcutRow label="Skip to next item">
                <KeyboardShortcut>→</KeyboardShortcut>
              </ShortcutRow>
              <ShortcutRow label="Previous item">
                <KeyboardShortcut>←</KeyboardShortcut>
              </ShortcutRow>
            </div>
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-bold tracking-wide uppercase">
                Score the item
              </p>
              <ShortcutRow label="Move between score fields">
                <KeyboardShortcut>↑</KeyboardShortcut>
                <KeyboardShortcut>↓</KeyboardShortcut>
              </ShortcutRow>
              <ShortcutRow label="Select an option on the focused field">
                <KeyboardShortcut>1</KeyboardShortcut>
                <span className="text-muted-foreground text-xs">–</span>
                <KeyboardShortcut>9</KeyboardShortcut>
              </ShortcutRow>
              <ShortcutRow label="Edit a field / open a dropdown">
                <KeyboardShortcut>↵</KeyboardShortcut>
              </ShortcutRow>
              <ShortcutRow label="Commit a number / leave a text field">
                <KeyboardShortcut>Esc</KeyboardShortcut>
                <span className="text-muted-foreground text-xs">/</span>
                <KeyboardShortcut>Tab</KeyboardShortcut>
              </ShortcutRow>
            </div>
            <p className="text-muted-foreground border-t pt-3 text-xs">
              Bare{" "}
              <KeyboardShortcut className="h-4 px-1 text-[9px]">
                ↵
              </KeyboardShortcut>{" "}
              inside a text field (e.g. Feedback) inserts a new line — use{" "}
              <KeyboardShortcut
                className="h-4 px-1 text-[9px]"
                keys={[modLabel, "↵"]}
              />{" "}
              to complete.
            </p>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
};
