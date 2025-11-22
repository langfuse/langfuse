/**
 * Unauthenticated layout variant
 * Used for sign-in, sign-up, and other auth pages
 * Minimal layout with no sidebar or navigation
 */

import type { PropsWithChildren } from "react";
import { SidebarProvider } from "@/src/components/ui/sidebar";

export function UnauthenticatedLayout({ children }: PropsWithChildren) {
  return (
    <SidebarProvider className="bg-primary-foreground">
      <main className="min-h-dvh w-full overflow-y-scroll p-3 px-4 py-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </SidebarProvider>
  );
}
