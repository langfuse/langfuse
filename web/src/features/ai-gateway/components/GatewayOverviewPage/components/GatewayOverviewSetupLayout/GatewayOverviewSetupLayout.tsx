import { type ReactNode } from "react";

import {
  GatewaySetupHero,
  type GatewaySetupHeroProps,
} from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewaySetupHero/GatewaySetupHero";

export type GatewayOverviewSetupLayoutProps = GatewaySetupHeroProps & {
  /** The setup guide, shown below the banner. */
  children: ReactNode;
};

/**
 * Overview while the gateway is not set up: banner, then the setup guide.
 * The banner background spans the full width; its content and the guide share one centered column.
 */
export function GatewayOverviewSetupLayout({
  providers,
  children,
}: GatewayOverviewSetupLayoutProps) {
  return (
    <div className="flex w-full flex-col gap-8 pb-6">
      <GatewaySetupHero providers={providers} />
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="max-w-3xl rounded-lg border p-6">{children}</div>
      </div>
    </div>
  );
}
