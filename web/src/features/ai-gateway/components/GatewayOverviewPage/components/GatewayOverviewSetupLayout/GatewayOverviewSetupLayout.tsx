import { type ReactNode } from "react";

import {
  GatewaySetupHero,
  type GatewaySetupHeroProps,
} from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewaySetupHero/GatewaySetupHero";
import { GatewaySetupHighlights } from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewaySetupHighlights/GatewaySetupHighlights";

export type GatewayOverviewSetupLayoutProps = GatewaySetupHeroProps & {
  /** The setup guide, shown in the main column. */
  children: ReactNode;
};

/**
 * Overview while the gateway is not set up: progress banner, setup guide, and what it unlocks.
 * The banner background spans the full width; its content and the guide share one centered column.
 */
export function GatewayOverviewSetupLayout({
  stepsDone,
  providers,
  children,
}: GatewayOverviewSetupLayoutProps) {
  return (
    <div className="flex w-full flex-col gap-8 pb-6">
      <GatewaySetupHero stepsDone={stepsDone} providers={providers} />
      <div className="mx-auto grid w-full max-w-6xl items-start gap-8 px-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="rounded-lg border p-6">{children}</div>
        <GatewaySetupHighlights />
      </div>
    </div>
  );
}
