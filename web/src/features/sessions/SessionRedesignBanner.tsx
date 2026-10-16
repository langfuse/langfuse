import { ArrowUpRight, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

export function SessionRedesignBanner({
  onDismiss,
}: {
  onDismiss: () => void;
}) {
  const capture = usePostHogClientCapture();
  return (
    <div className="relative flex shrink-0 items-center justify-center gap-2 border-b border-orange-200/50 bg-orange-50/60 px-10 py-1 text-sm text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-200">
      <span className="text-foreground">We redesigned the session view.</span>
      <a
        href="https://langfuse.com/changelog/2026-10-13-redesigned-session-view"
        onClick={() => capture("session_detail:announcement_learn_more_click")}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center hover:shadow-[0_1px_currentColor]"
      >
        Learn more
        <ArrowUpRight className="icon-sm" aria-hidden="true" />
      </a>
      <a
        href="https://github.com/orgs/langfuse/discussions/18687"
        onClick={() => capture("session_detail:announcement_feedback_click")}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center hover:shadow-[0_1px_currentColor]"
      >
        Give feedback
        <ArrowUpRight className="icon-sm" aria-hidden="true" />
      </a>
      <div className="absolute right-2 flex items-center">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss redesigned sessions view banner"
          onClick={() => {
            capture("session_detail:announcement_dismiss");
            onDismiss();
          }}
        >
          <X className="icon-base" />
        </Button>
      </div>
    </div>
  );
}
