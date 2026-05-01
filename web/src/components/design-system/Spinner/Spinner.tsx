import { cn } from "@/src/utils/tailwind";
import { Loader2 } from "lucide-react";

export default function Spinner({
  variant,
  size,
}: {
  variant?: "text-primary" | "inline" | "text-muted-foreground";
  size:
    | "h-3.5 w-3.5"
    | "h-3 w-3"
    | "h-4 w-4"
    | "h-5 w-5"
    | "h-6 w-6"
    | "h-8 w-8"
    | "h-12 w-12"
    | "h-full w-full";
}) {
  return <Loader2 className={cn("animate-spin", variant, size)} />;
}
