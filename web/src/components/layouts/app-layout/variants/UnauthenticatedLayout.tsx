/**
 * Unauthenticated layout variant
 * Used for sign-in, sign-up, and other auth pages
 * Minimal layout with no sidebar or navigation
 */

import type { PropsWithChildren } from "react";

export function UnauthenticatedLayout({ children }: PropsWithChildren) {
  return (
    <div className="bg-primary-foreground min-h-screen-with-banner flex w-full">
      <main className="min-h-dvh w-full overflow-y-auto p-3 px-4 py-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
