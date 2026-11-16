import {
  BookOpen,
  CircleDollarSign,
  KeyRound,
  ShieldCheck,
  TextAlignStart,
} from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import {
  GatewaySetupSwitchboard,
  type GatewaySetupSwitchboardProps,
} from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewaySetupHero/GatewaySetupSwitchboard";
import { GatewayPlaceholder } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayPlaceholder";
import { GATEWAY_TRAFFIC_SOURCES } from "@/src/features/ai-gateway/constants/gatewayTrafficSources";

export type GatewayAnalyticsNoKeysEmptyStateProps = {
  gatewayKeysHref: string;
  docsHref: string;
  providers: GatewaySetupSwitchboardProps["providers"];
};

/** Overview before any gateway key exists: what to do next and what the gateway adds. */
export function GatewayAnalyticsNoKeysEmptyState({
  gatewayKeysHref,
  docsHref,
  providers,
}: GatewayAnalyticsNoKeysEmptyStateProps) {
  return (
    <GatewayPlaceholder.Frame
      title="Send your first request"
      description="Cost and usage show up here once requests go through the AI Gateway. Add a gateway key, then point your LLM client at the gateway."
    >
      <GatewayPlaceholder.Actions>
        <Button text="Add gateway key" icon={KeyRound} href={gatewayKeysHref} />
        <Button
          variant="outline"
          text="Read the docs"
          icon={BookOpen}
          href={docsHref}
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
          title="One key for every provider"
          description="Use one key for Anthropic and OpenAI."
        />
        <GatewayPlaceholder.Benefit
          icon={CircleDollarSign}
          title="Spend by person and team"
          description="Track spend by person, team, and key."
        />
        <GatewayPlaceholder.Benefit
          icon={ShieldCheck}
          title="Approved models only"
          description="Approve and remove models for entire company."
        />
        <GatewayPlaceholder.Benefit
          icon={TextAlignStart}
          title="Full traces"
          description="Record full traces, not just token counts."
        />
      </GatewayPlaceholder.Benefits>
    </GatewayPlaceholder.Frame>
  );
}
