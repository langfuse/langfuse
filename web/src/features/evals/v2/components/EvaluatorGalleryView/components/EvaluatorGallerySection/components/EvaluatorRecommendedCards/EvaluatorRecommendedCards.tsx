import type { ReactNode } from "react";

export function EvaluatorRecommendedCards({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <div className="@container flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
            {label}
          </h4>
          {count != null ? (
            <span className="text-muted-foreground ml-auto font-mono text-xs tabular-nums">
              {count}
            </span>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">{children}</div>
    </div>
  );
}
