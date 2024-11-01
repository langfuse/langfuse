import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";
import { Portal } from "@radix-ui/react-hover-card";
import { Info } from "lucide-react";

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

  return (
    <HoverCard
      openDelay={200}
      onOpenChange={(open) => {
        if (open) {
          capture("help_popup:opened", {
            hfref: href,
            description: description,
          });
        }
      }}
    >
      <HoverCardTrigger
        className={cn("mx-1", href ? "cursor-pointer" : "cursor-default")}
        asChild
      >
        <div
          className="inline-block whitespace-nowrap text-muted-foreground sm:pl-0"
          onClick={(e) => {
            if (!href) return;
            e.preventDefault();
            e.stopPropagation();
            window.open(href, "_blank");
            capture("help_popup:href_clicked", {
              href: href,
              description: description,
            });
          }}
        >
          <Info className={"h-3 w-3"} />
        </div>
      </HoverCardTrigger>
      <Portal>
        <HoverCardContent>
          {typeof description === "string" ? (
            <div
              className={cn(
                "whitespace-break-spaces text-xs font-normal text-primary sm:pl-0",
                className,
              )}
            >
              {description}
            </div>
          ) : (
            description
          )}
        </HoverCardContent>
      </Portal>
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
        {typeof description === "string" ? (
          <div className="whitespace-break-spaces text-xs font-normal text-primary sm:pl-0">
            {description}
          </div>
        ) : (
          description
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
