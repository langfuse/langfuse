import { Loader2 } from "lucide-react";

export default function Spinner({
  variant,
}: {
  variant:
    | "h-3 w-3 animate-spin"
    | "h-4 w-4 animate-spin"
    | "h-5 w-5 animate-spin"
    | "h-6 w-6 animate-spin"
    | "h-3.5 w-3.5 animate-spin"
    | "text-muted-foreground h-5 w-5 animate-spin"
    | "h-full w-full animate-spin"
    | "text-primary h-12 w-12 animate-spin"
    | "text-muted-foreground h-4 w-4 animate-spin"
    | "inline h-4 w-4 animate-spin"
    | "text-muted-foreground h-8 w-8 animate-spin"
    | "text-muted-foreground h-12 w-12 animate-spin";
}) {
  return <Loader2 className={variant} />;
}
