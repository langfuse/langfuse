export function PlaceholderPage({
  label,
  description,
  route,
}: {
  label: string;
  description: string;
  route: string;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-3">
      <div className="bg-card w-full max-w-3xl rounded-[28px] border p-8 shadow-sm">
        <div className="mb-4 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium">
          Phase 1 shell
        </div>
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">{label}</h2>
          <p className="text-muted-foreground max-w-2xl text-sm leading-6">
            {description}
          </p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="bg-muted/40 rounded-2xl border p-4">
            <p className="text-sm font-medium">Structure locked in</p>
            <p className="text-muted-foreground mt-1 text-sm">
              This page exists to validate the new navigation, routing, and
              frame hierarchy before feature content moves in.
            </p>
          </div>
          <div className="bg-muted/40 rounded-2xl border p-4">
            <p className="text-sm font-medium">Content intentionally empty</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Data, cards, editors, and tables stay out of phase 1 so the shell
              can be reviewed on its own.
            </p>
          </div>
        </div>
        <div className="bg-muted/60 mt-6 rounded-2xl border p-4">
          <p className="text-xs font-medium tracking-[0.16em] uppercase">
            Preview route
          </p>
          <code className="mt-2 block overflow-x-auto text-xs leading-6">
            {route}
          </code>
        </div>
      </div>
    </div>
  );
}
