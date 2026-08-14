import { CheckCircle2, TriangleAlert } from "lucide-react";

import { Card } from "@/src/components/ui/card";
import { cn } from "@/src/utils/tailwind";

/**
 * The Health page's one-glance verdict: a bordered card with a dim,
 * low-saturation tint (fills read quieter than text) and a full-size
 * sentence, so "am I OK?" is the first thing the eye lands on instead of a
 * muted footnote.
 */
export function HealthStatusBanner({
  tone,
  children,
}: {
  tone: "green" | "yellow";
  children: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "flex flex-row items-center gap-2.5 p-3",
        tone === "green" && "bg-light-green/40",
        tone === "yellow" && "bg-light-yellow/40",
      )}
    >
      {tone === "green" ? (
        <CheckCircle2
          aria-hidden
          className="text-dark-green h-4 w-4 shrink-0"
        />
      ) : (
        <TriangleAlert
          aria-hidden
          className="text-dark-yellow h-4 w-4 shrink-0"
        />
      )}
      <p className="text-foreground text-sm">{children}</p>
    </Card>
  );
}
