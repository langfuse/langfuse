import { ArrowRight, BookOpen, Plus } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { GatewayProviderMark } from "@/src/features/ai-gateway/components/GatewayProviderMark";
import { getGatewaySetupHeroProviders } from "@/src/features/ai-gateway/components/GatewayOverviewPage/fns/getGatewaySetupHeroProviders";
import { GatewayPlaceholder } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayPlaceholder";
import { GATEWAY_SETUP_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import { formatAvailableGatewayProviderNames } from "@/src/features/ai-gateway/fns/formatAvailableGatewayProviderNames";
import { NoProvidersDiagram } from "./components/NoProvidersDiagram";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

const CREDENTIAL_SOURCES = {
  ANTHROPIC: "API key from console.anthropic.com",
  OPENAI: "API key from platform.openai.com",
  BEDROCK: "Bedrock API key and region",
  OPENROUTER: "API key from openrouter.ai",
  XAI: "API key from console.x.ai",
  VERCEL: "API key from vercel.com",
  AZURE: "Resource name and API key",
  GOOGLE_AI_STUDIO: "API key from aistudio.google.com",
  VERTEX: "Service account key and location",
} satisfies Record<GatewayProvider, string>;

export type GatewayNoProvidersEmptyStateProps = {
  onAddProvider: () => void;
  onConnectProvider: (provider: GatewayProvider) => void;
};

/** Shown to gateway managers until the organization has a provider credential. */
export function GatewayNoProvidersEmptyState({
  onAddProvider,
  onConnectProvider,
}: GatewayNoProvidersEmptyStateProps) {
  const providerNames = formatAvailableGatewayProviderNames();
  return (
    <GatewayPlaceholder.Frame
      title="No connections yet"
      description={`Add an ${providerNames} connection so the gateway can route requests and discover models.`}
    >
      <GatewayPlaceholder.Actions>
        <Button text="Add connection" icon={Plus} onClick={onAddProvider} />
        <Button
          variant="outline"
          text="How to set up the gateway"
          icon={BookOpen}
          href={GATEWAY_SETUP_DOCS_URL}
        />
      </GatewayPlaceholder.Actions>
      <NoProvidersDiagram unconnectedVariant="placeholder" />
      <ul className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {getGatewaySetupHeroProviders(new Set()).map(({ provider }) => (
          <li key={provider}>
            <button
              type="button"
              onClick={() => onConnectProvider(provider)}
              className="hover:bg-accent/50 focus-visible:ring-ring flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-hidden"
            >
              <GatewayProviderMark provider={provider} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-bold">
                  {providerLabels[provider]}
                </span>
                <span className="text-muted-foreground text-xs">
                  {CREDENTIAL_SOURCES[provider]}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm">
                Connect
                <ArrowRight size="sm" color="inherit" aria-hidden />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </GatewayPlaceholder.Frame>
  );
}
