import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";
import { HelpCircle, Info } from "lucide-react";
import Link from "next/link";

export type DocPopupProps = {
  description: React.ReactNode;
  href?: string;
  style?: "question" | "info";
  size?: "xs" | "sm" | "md" | "lg";
};

export default function DocPopup({
  description,
  href,
  style = "info",
  size = "sm",
}: DocPopupProps) {
  const sizes = {
    xs: "w-3 h-3",
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };
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
        {href ? (
          <Link
            href={href}
            rel="noopener"
            target="_blank"
            className="inline-block whitespace-nowrap text-muted-foreground sm:pl-0"
            onClick={() => {
              capture("help_popup:href_clicked", {
                href: href,
                description: description,
              });
            }}
          >
            {
              {
                question: <HelpCircle className={sizes[size]} />,
                info: <Info className={sizes[size]} />,
              }[style]
            }
          </Link>
        ) : (
          <div className="inline-block whitespace-nowrap text-muted-foreground sm:pl-0">
            {
              {
                question: <HelpCircle className={sizes[size]} />,
                info: <Info className={sizes[size]} />,
              }[style]
            }
          </div>
        )}
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
