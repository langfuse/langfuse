/**
 * Minimal layout variant
 * Used for onboarding, public routes, and other pages without navigation
 * Similar to unauthenticated but semantically different use case
 */

import type { PropsWithChildren } from "react";

export function MinimalLayout({
  children,
  fullBleed = false,
}: PropsWithChildren<{ fullBleed?: boolean }>) {
  return (
    <div className="bg-primary-foreground min-h-screen-with-banner flex w-full">
      <main
        className={`min-h-dvh w-full overflow-y-auto ${fullBleed ? "" : "p-3 px-4 py-4 sm:px-6 lg:px-8"}`}
      >
        {children}
      </main>
    </div>
  );
}
