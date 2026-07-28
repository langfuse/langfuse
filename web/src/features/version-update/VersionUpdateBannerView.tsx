import { RotateCw, Sparkles, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

export type VersionUpdateBannerViewProps = {
  /** Reload the tab to pick up the new build. */
  onReload: () => void;
  /** Hide the notification for this session. */
  onDismiss: () => void;
  className?: string;
};

/**
 * Presentational "Langfuse just got an update" notification — a floating,
 * frosted-glass pill pinned center-top, NOT a layout-pushing top bar. It sits
 * over page content (the connected banner renders it into the top-most overlay
 * layer), so it may cover whatever is directly behind it; the rest of the app
 * stays interactive (there is no backdrop). It does respect the top-banner
 * offset, so it drops below a full-width top banner (e.g. the payment banner)
 * instead of overlapping it.
 *
 * Purely props-driven (no store/context/data) so it renders in isolation — see
 * `VersionUpdateBannerView.stories.tsx`. The connected {@link VersionUpdateBanner}
 * wires it to the store, the overlay layer, and analytics.
 *
 * We prompt rather than auto-reload: reloading would discard unsaved work (open
 * annotations, editors); the user reloads when it is safe for them.
 */
export function VersionUpdateBannerView({
  onReload,
  onDismiss,
  className,
}: VersionUpdateBannerViewProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        // `top-banner-offset` = safe-area + any registered top banner's height,
        // so the pill sits below a full-width top banner (e.g. PaymentBanner)
        // rather than overlapping it; `mt-4` keeps a 16px gap (and, with no top
        // banner, places it ~16px from the viewport top).
        "top-banner-offset fixed left-1/2 mt-4 -translate-x-1/2",
        "flex items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4",
        "border-border/60 bg-background/80 border shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:ring-white/10",
        // `fill-mode-both` holds the entrance keyframes' start state on the
        // mount frame, before the animation's first tick — without it the pill
        // can paint one frame at its final position/opacity and then snap back
        // to animate (a flash that reads as a "jump"; Firefox is most prone).
        "animate-in fade-in-0 slide-in-from-top-4 zoom-in-95 fill-mode-both duration-500 ease-out",
        className,
      )}
    >
      <Sparkles className="text-primary h-4 w-4 shrink-0" />
      <span className="text-foreground text-sm whitespace-nowrap">
        Langfuse just got an update
      </span>
      <Button size="sm" className="rounded-full" onClick={onReload}>
        <RotateCw className="mr-1.5 h-3.5 w-3.5" />
        Reload
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-muted-foreground rounded-full"
        onClick={onDismiss}
        aria-label="Dismiss"
        title="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
