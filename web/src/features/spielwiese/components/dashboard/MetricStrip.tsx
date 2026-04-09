type Metric = {
  id: string;
  label: string;
  value: string;
};

type MetricStripProps = {
  metrics: Metric[];
};

export function MetricStrip({ metrics }: MetricStripProps) {
  return (
    <section
      aria-label="Key metrics"
      className="grid gap-3 sm:grid-cols-3"
      data-testid="spielwiese-metric-strip"
    >
      {metrics.map((metric) => (
        <article
          key={metric.id}
          className="bg-card text-card-foreground rounded-xl border p-4"
        >
          <p className="text-muted-foreground truncate text-sm">
            {metric.label}
          </p>
          <p className="text-2xl font-semibold tabular-nums">{metric.value}</p>
        </article>
      ))}
    </section>
  );
}
