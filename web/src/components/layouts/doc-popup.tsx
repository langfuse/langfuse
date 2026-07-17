import { useState } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  HoverCardPortal,
} from "@/src/components/ui/hover-card";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";
import { ExternalLink, Info } from "lucide-react";

export type DocPopupProps = {
  description: React.ReactNode;
  href?: string;
  className?: string;
};

export default function DocPopup({
  description,
  href,
  className,
}: DocPopupProps) {
  const capture = usePostHogClientCapture();
  // Controlled so a CLICK/TAP on the icon also opens the card: HoverCard
  // never opens on touch by itself, and the old click-to-navigate behavior
  // is gone — docs open only via the explicit link inside the card.
  const [open, setOpen] = useState(false);
  // Single open-change path: Radix only calls onOpenChange from its own
  // hover/focus handling, so the click handler must route through here too
  // or tap-opens (the only way in on touch) would never be captured.
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      capture("help_popup:opened", {
        hfref: href,
        description: description,
      });
    }
  };

  return (
    <HoverCard openDelay={200} open={open} onOpenChange={handleOpenChange}>
      {/* The ⓘ itself never navigates; a click toggles the card (touch
          support) and must not bubble into whatever the icon sits on —
          e.g. a filter facet's accordion trigger. */}
      <HoverCardTrigger className="mx-1 cursor-help" asChild>
        <div
          className="text-muted-foreground inline-block whitespace-nowrap sm:pl-0"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleOpenChange(!open);
          }}
        >
          <Info className="h-3 w-3" />
        </div>
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent>
          <div
            className={cn(
              "text-primary text-xs font-normal whitespace-break-spaces sm:pl-0",
              className,
            )}
          >
            {description}
          </div>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
                capture("help_popup:href_clicked", {
                  href: href,
                  description: description,
                });
              }}
              className="text-muted-foreground hover:text-primary mt-2 inline-flex items-center gap-1 text-xs underline underline-offset-2"
            >
              Read docs
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
}

export type PopupProps = {
  triggerContent: React.ReactNode;
  description: React.ReactNode;
};

export function Popup({ triggerContent, description }: PopupProps) {
  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger className="mx-1 cursor-pointer" asChild>
        <div>{triggerContent}</div>
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="text-primary text-xs font-normal whitespace-break-spaces sm:pl-0">
          {description}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
