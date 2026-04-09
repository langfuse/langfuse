/**
 * Minimal layout variant
 * Used for onboarding, public routes, and other pages without navigation
 * Similar to unauthenticated but semantically different use case
 */

import type { PropsWithChildren } from "react";
import { useRouter } from "next/router";
import { SidebarProvider } from "@/src/components/ui/sidebar";
import { AgentationSurface } from "@/src/features/agentation/components/AgentationSurface";
import { PATH_CONSTANTS } from "../utils/pathClassification";

export function MinimalLayout({ children }: PropsWithChildren) {
  const router = useRouter();
  const shouldRenderSpielwieseAgentation =
    router.pathname === "/dev/spielwiese";
  const isFullBleedPreview =
    PATH_CONSTANTS.publicFullBleed.some((path) =>
      router.pathname.startsWith(path),
    ) ||
    PATH_CONSTANTS.minimalFullBleed.some((path) =>
      router.pathname.startsWith(path),
    );

  if (isFullBleedPreview) {
    return (
      <>
        {children}
        {shouldRenderSpielwieseAgentation ? <AgentationSurface /> : null}
      </>
    );
  }

  return (
    <SidebarProvider className="bg-primary-foreground">
      <main className="min-h-dvh w-full overflow-y-scroll p-3 px-4 py-4 sm:px-6 lg:px-8">
        {children}
      </main>
      {shouldRenderSpielwieseAgentation ? <AgentationSurface /> : null}
    </SidebarProvider>
  );
}
