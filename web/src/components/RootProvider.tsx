import React, { type ReactNode } from "react";
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import NextAdapterPages from "next-query-params/pages";
import { QueryParamProvider } from "use-query-params";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import { CommandMenuProvider } from "@/src/features/command-k-menu/CommandMenuProvider";
import { SupportDrawerProvider } from "@/src/features/support-chat/SupportDrawerProvider";
import { DetailPageListsProvider } from "@/src/features/navigate-detail-pages/context";
import { env } from "@/src/env.mjs";
import { ThemeProvider } from "@/src/features/theming/ThemeProvider";
import { MarkdownContextProvider } from "@/src/features/theming/useMarkdownContext";
import { ScoreCacheProvider } from "@/src/features/scores/contexts/ScoreCacheContext";

interface RootProviderProps {
  children: ReactNode;
  session: Session | null;
}

export const RootProvider: React.FC<RootProviderProps> = ({
  children,
  session,
}) => {
  return (
    <QueryParamProvider adapter={NextAdapterPages}>
      <TooltipProvider>
        <CommandMenuProvider>
          <SessionProvider
            session={session}
            refetchOnWindowFocus={true}
            refetchInterval={5 * 60} // 5 minutes
            basePath={`${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/auth`}
          >
            <DetailPageListsProvider>
              <MarkdownContextProvider>
                <ThemeProvider
                  attribute="class"
                  enableSystem
                  disableTransitionOnChange
                >
                  <ScoreCacheProvider>
                    <SupportDrawerProvider defaultOpen={false}>
                      {children}
                    </SupportDrawerProvider>
                  </ScoreCacheProvider>
                </ThemeProvider>
              </MarkdownContextProvider>
            </DetailPageListsProvider>
          </SessionProvider>
        </CommandMenuProvider>
      </TooltipProvider>
    </QueryParamProvider>
  );
};
