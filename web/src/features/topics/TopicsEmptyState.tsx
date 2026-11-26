/** A question without a topic map yet: it lacks enough analyzed traces. */
export function TopicsEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h3 className="text-lg font-bold">Not enough analyzed traces yet</h3>
      <p className="text-muted-foreground max-w-sm text-sm">
        Topics appear once at least 100 traces are analyzed for this question.
        New traces are analyzed as they arrive.
      </p>
    </div>
  );
}
