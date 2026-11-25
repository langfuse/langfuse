import {
  CircleDollarSign,
  KeyRound,
  ShieldCheck,
  TextAlignStart,
} from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { GatewayTrafficDiagram } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayTrafficDiagram";
import { GatewayPlaceholder } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayPlaceholder";

export type GatewayAnalyticsNoKeysEmptyStateProps = {
  gatewayKeysHref: string;
  docsHref: string;
};

/** Overview before any gateway key exists: what to do next and what the gateway adds. */
export function GatewayAnalyticsNoKeysEmptyState({
  gatewayKeysHref,
  docsHref,
}: GatewayAnalyticsNoKeysEmptyStateProps) {
  return (
    <GatewayPlaceholder.Frame
      title="Send your first request"
      description="Cost and usage show up here once requests go through the AI Gateway. Add a gateway key, then point your LLM client at the gateway."
    >
      <GatewayPlaceholder.Actions>
        <Button variant="outline" text="Read the docs" href={docsHref} />
        <Button text="Add gateway key" icon={KeyRound} href={gatewayKeysHref} />
      </GatewayPlaceholder.Actions>
      <GatewayTrafficDiagram />
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
