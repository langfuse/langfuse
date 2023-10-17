import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { HelpCircle } from "lucide-react";
import Link from "next/link";

export type DocPopupProps = {
  description: React.ReactNode;
  link: string;
  size?: "sm" | "md" | "lg";
};

export default function DocPopup({ description, link, size }: DocPopupProps) {
  let sizeClass = "w-4 h-4";
  switch (size) {
    case "sm": {
      sizeClass = "w-4 h-4";
    }
    case "md": {
      sizeClass = "w-6 h-6";
    }
    case "lg": {
      sizeClass = "w-8 h-8";
    }
  }

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger className="mx-2 cursor-pointer">
        <Link href={link} rel="noopener" target="_blank">
          <div className="whitespace-nowrap text-gray-500 sm:pl-0">
            <HelpCircle className={sizeClass} />
          </div>
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
