/* eslint-disable @repo/no-style-props */
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
    <div className={cn("animate-in flex flex-col items-start", className)}>
      <div className="text-3xl font-bold">{metric}</div>
      {description || children ? (
        <div className="flex min-w-0 items-center gap-1">
          {description ? (
            <p className="text-muted-foreground text-sm">{description}</p>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
};
