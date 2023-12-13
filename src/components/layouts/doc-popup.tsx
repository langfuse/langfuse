import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { HelpCircle } from "lucide-react";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";

export type DocPopupProps = {
  description: React.ReactNode;
  href: string;
  size?: "sm" | "md" | "lg";
};

export default function DocPopup({
  description,
  href,
  size = "sm",
}: DocPopupProps) {
  const sizes = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };
  const posthog = usePostHog();

  return (
    <HoverCard
      openDelay={200}
      onOpenChange={(open) => {
        if (open) {
          posthog.capture("help-popup:opened", { href, description });
        }
      }}
    >
      <HoverCardTrigger className="mx-1 cursor-pointer" asChild>
        <Link
          href={href}
          rel="noopener"
          target="_blank"
          className="inline-block whitespace-nowrap text-gray-500 sm:pl-0"
        >
          <HelpCircle className={sizes[size]} />
        </Link>
      </HoverCardTrigger>
      <HoverCardContent>
        {typeof description === "string" ? (
          <div className="whitespace-break-spaces text-xs font-normal text-gray-800 sm:pl-0">
            {description}
          </div>
        ) : (
          description
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
