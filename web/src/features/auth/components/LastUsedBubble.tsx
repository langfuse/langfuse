import { Badge } from "@/src/components/ui/badge";
import { cn } from "@/src/utils/tailwind";

interface LastUsedBubbleProps {
  className?: string;
  variant?: "default" | "secondary" | "outline";
}

export function LastUsedBubble({ 
  className, 
  variant = "default" 
}: LastUsedBubbleProps) {
  return (
    <Badge
      variant={variant}
      className={cn(
        "ml-2 px-2 py-0.5 text-xs font-medium",
        "bg-blue-100 text-blue-800 border-blue-200",
        "dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
        "animate-in fade-in-0 zoom-in-95 duration-200",
        className
      )}
    >
      Last Used
    </Badge>
  );
}