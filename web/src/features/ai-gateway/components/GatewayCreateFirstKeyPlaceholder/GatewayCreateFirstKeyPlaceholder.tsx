import Link from "next/link";
import { BookOpen, Box, KeyRound, Plus } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import {
  GatewaySetupSwitchboard,
  type GatewaySetupSwitchboardProps,
} from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewaySetupHero/GatewaySetupSwitchboard";
import { GatewayPlaceholder } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayPlaceholder";
import { GATEWAY_TRAFFIC_SOURCES } from "@/src/features/ai-gateway/constants/gatewayTrafficSources";

export type GatewayCreateFirstKeyPlaceholderProps = {
  organizationName: string | undefined;
  providers: GatewaySetupSwitchboardProps["providers"];
  onCreateKey: () => void;
  usageInstructionsHref: string;
  modelsHref: string;
};

/** Shown to members of a set-up gateway until they create their first key. */
export function GatewayCreateFirstKeyPlaceholder({
  organizationName,
  providers,
  onCreateKey,
  usageInstructionsHref,
  modelsHref,
}: GatewayCreateFirstKeyPlaceholderProps) {
  return (
    <GatewayPlaceholder.Frame
      title="Create your gateway key"
      description={
        <>
          Your admin set up the AI Gateway for{" "}
          <span className="ph-no-capture">
            {organizationName ?? "your organization"}
          </span>
          . Create a personal key to send requests from Claude Code, Codex, or
          your own code.
        </>
      }
    >
      <GatewayPlaceholder.Actions>
        <Button text="Create my key" icon={Plus} onClick={onCreateKey} />
        <Button
          variant="outline"
          text="Usage instructions"
          icon={BookOpen}
          href={usageInstructionsHref}
        />
      </GatewayPlaceholder.Actions>
      <GatewayPlaceholder.Diagram>
        <div className="mx-auto aspect-[440/200] w-full max-w-xl">
          <GatewaySetupSwitchboard
            providers={providers}
            sources={GATEWAY_TRAFFIC_SOURCES}
          />
        </div>
      </GatewayPlaceholder.Diagram>
      <GatewayPlaceholder.Benefits>
        <GatewayPlaceholder.Benefit
          icon={KeyRound}
          title="Create your own keys"
          description="Mint a new key whenever you need one."
        />
        <GatewayPlaceholder.Benefit
          icon={Box}
          title="One key for Anthropic and OpenAI models"
          description={
            <>
              Use the same key across providers.{" "}
              <Link href={modelsHref} className="underline">
                See available models
              </Link>
            </>
          }
        />
      </GatewayPlaceholder.Benefits>
    </GatewayPlaceholder.Frame>
  );
}
