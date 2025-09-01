import { cn } from "@/src/utils/tailwind";
import { type ReactNode } from "react";

export const TotalMetric = ({
  className,
  metric,
  description,
  children,
}: {
  className?: string;
  metric: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) => {
  return (
    <div
      className={cn(
        "flex items-baseline justify-start space-x-2 animate-in",
        className,
      )}
    >
      <div className="text-3xl font-bold">{metric}</div>
      <p className="text-sm text-muted-foreground">{description}</p>
      {children}
    </div>
  );
};
