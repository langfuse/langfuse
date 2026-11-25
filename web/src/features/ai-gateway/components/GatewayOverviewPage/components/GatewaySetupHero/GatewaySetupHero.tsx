import { useId } from "react";

import { Button } from "@/src/components/design-system/Button/Button";
import { GatewayFanOutDiagram } from "@/src/features/ai-gateway/components/GatewayFanOutDiagram/GatewayFanOutDiagram";
import diagramStyles from "@/src/features/ai-gateway/components/GatewayFanOutDiagram/gatewayFanOutDiagram.module.css";
import { GATEWAY_SETUP } from "@/src/features/ai-gateway/components/GatewaySetupPage/constants/gatewaySetup";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";
import { cn } from "@/src/utils/tailwind";

export type GatewaySetupHeroProps = {
  providers: ReadonlyArray<{ provider: GatewayProvider; isConnected: boolean }>;
};

/** Overview banner while the gateway is not set up. */
export function GatewaySetupHero({ providers }: GatewaySetupHeroProps) {
  const titleId = useId();
  const connectedLabels = providers
    .filter(({ isConnected }) => isConnected)
    .map(({ provider }) => providerLabels[provider]);

  return (
    <section
      aria-labelledby={titleId}
      className={cn("overflow-hidden", diagramStyles.panel)}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-12 px-6 py-8">
        <div className="flex max-w-lg min-w-0 flex-1 basis-96 flex-col gap-4">
          <h2 id={titleId} className="text-3xl font-bold tracking-tight">
            Set up Langfuse AI Gateway
          </h2>
          <p className="text-foreground-secondary text-base">
            Route Claude Code, Codex, OpenCode, and your own apps through
            Langfuse. Each call becomes a full trace, along with who made it and
            what it cost.
          </p>
          <div>
            <Button
              variant="text"
              text="How to set up the gateway"
              href={GATEWAY_SETUP.docsUrl}
            />
          </div>
          <p className="sr-only">
            {connectedLabels.length > 0
              ? `Connected providers: ${connectedLabels.join(", ")}.`
              : "No provider connected yet."}
          </p>
        </div>
        <div className="w-full max-w-md basis-md">
          <GatewayFanOutDiagram sources={[]} />
        </div>
      </div>
    </section>
  );
}
