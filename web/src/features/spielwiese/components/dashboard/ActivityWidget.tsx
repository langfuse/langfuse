export function ActivityWidget() {
  return (
    <section
      className="bg-card text-card-foreground @container rounded-xl border p-4"
      data-testid="spielwiese-activity-widget"
    >
      <div className="flex flex-col gap-3">
        <header className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Activity</h2>
          <p className="text-muted-foreground text-sm">
            Local shell widget placeholder for guardrail verification.
          </p>
        </header>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">Latest traces</span>
            <span className="text-sm font-medium tabular-nums">124</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">Open feedback</span>
            <span className="text-sm font-medium tabular-nums">18</span>
          </div>
        </div>
      </div>
    </section>
  );
}
