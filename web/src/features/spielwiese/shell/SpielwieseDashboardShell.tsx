import type { ReactNode } from "react";

type SpielwieseDashboardShellProps = {
  children: ReactNode;
};

export function SpielwieseDashboardShell({
  children,
}: SpielwieseDashboardShellProps) {
  return (
    <div
      className="bg-background text-foreground isolate min-h-dvh"
      data-testid="spielwiese-shell"
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm tracking-[0.2em] uppercase">
            Spielwiese
          </p>
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-semibold">Local dashboard shell</h1>
            <p className="text-muted-foreground text-base sm:text-sm">
              Guardrail-first preview with a local shell and no product chrome.
            </p>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-6">{children}</main>
      </div>
    </div>
  );
}
