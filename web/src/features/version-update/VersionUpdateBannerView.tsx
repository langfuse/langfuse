import { forwardRef, type CSSProperties } from "react";
import { RotateCw, Sparkles, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

export type VersionUpdateBannerViewProps = {
  /** Reload the tab to pick up the new build. */
  onReload: () => void;
  /** Hide the banner for this session. */
  onDismiss: () => void;
  /** Inline styles (used by the connected banner to offset below other banners). */
  style?: CSSProperties;
  className?: string;
};

/**
 * Presentational "a new version is available — reload" banner. Purely
 * props-driven (no store, no context, no data fetching) so it renders in
 * isolation — see `VersionUpdateBannerView.stories.tsx`. The connected
 * {@link VersionUpdateBanner} wires it to the version-update store and the
 * top-banner offset system.
 *
 * We prompt rather than auto-reload on purpose: reloading would discard unsaved
 * work (open annotations, editors). The user reloads when it is safe for them.
 */
export const VersionUpdateBannerView = forwardRef<
  HTMLDivElement,
  VersionUpdateBannerViewProps
>(function VersionUpdateBannerView(
  { onReload, onDismiss, style, className },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "bg-foreground text-background fixed top-0 z-51 flex w-full items-center justify-between gap-4 px-4 py-1",
        className,
      )}
      style={style}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <Sparkles className="h-4 w-4 shrink-0" />
        <span className="text-sm">A new version of Langfuse is available.</span>
      </div>

      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={onReload}>
          <RotateCw className="mr-2 h-4 w-4" />
          Reload
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onDismiss}
          aria-label="Dismiss"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});
