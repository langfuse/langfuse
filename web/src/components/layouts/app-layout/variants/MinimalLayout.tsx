/**
 * Minimal layout variant
 * Used for onboarding, public routes, and other pages without navigation
 * Similar to unauthenticated but semantically different use case
 */

import type { PropsWithChildren } from "react";
import { SidebarProvider } from "@/src/components/ui/sidebar";

export function MinimalLayout({ children }: PropsWithChildren) {
  return (
    <SidebarProvider className="bg-primary-foreground">
      <main className="min-h-dvh w-full overflow-y-scroll p-3 px-4 py-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </SidebarProvider>
  );
}
