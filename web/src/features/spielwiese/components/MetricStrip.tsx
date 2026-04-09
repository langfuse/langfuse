import { Card, CardContent } from "../ui/card";
import type { SpielwieseMetricVM } from "../types/dashboard";

type MetricStripProps = {
  metrics: SpielwieseMetricVM[];
};

export function MetricStrip({ metrics }: MetricStripProps) {
  return (
    <section
      aria-label="Key metrics"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      data-testid="spielwiese-metric-strip"
    >
      {metrics.map((metric) => (
        <Card
          key={metric.id}
          className="border-border/60 bg-card/85 overflow-hidden rounded-[1.25rem] border"
          data-status={metric.status}
        >
          <CardContent className="flex h-full flex-col gap-4 pt-5">
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground truncate text-sm">
                {metric.label}
              </p>
              <p className="text-3xl font-semibold tabular-nums">
                {metric.value}
              </p>
            </div>
            <div className="mt-auto flex items-center justify-between gap-3 text-sm">
              <span className="bg-muted text-foreground rounded-full px-2.5 py-1 font-medium">
                {metric.delta}
              </span>
              <span className="text-muted-foreground">{metric.trend}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
