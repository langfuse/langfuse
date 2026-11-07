import { GatewaySetupHero } from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewaySetupHero/GatewaySetupHero";
import { GatewaySetupHighlights } from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewaySetupHighlights/GatewaySetupHighlights";
import { ConnectedGatewaySetupGuide } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ConnectedGatewaySetupGuide";
import { GatewayConfigLoader } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewayConfigLoader";
import { useGatewaySetupProgress } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useGatewaySetupProgress";
import type {
  GatewayConfig,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { getAvailableGatewayProviders } from "@/src/features/ai-gateway/fns/getAvailableGatewayProviders";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

const HERO_PROVIDER_ORDER: GatewayProvider[] = [
  "ANTHROPIC",
  "OPENAI",
  "BEDROCK",
];

/** Steps before the open one are done; finishing the last leaves the setup view. */
const STEPS_DONE = { 1: 0, 2: 1, 3: 2 } as const;

type GatewayOverviewSetupProps = {
  organizationId: string;
  projects: GatewayProject[];
  onFinish: () => void;
};

/** Overview while the gateway is not set up: progress banner, setup guide, and what it unlocks. */
export function GatewayOverviewSetup(props: GatewayOverviewSetupProps) {
  return (
    <GatewayConfigLoader organizationId={props.organizationId}>
      {(config) => <GatewayOverviewSetupContent {...props} config={config} />}
    </GatewayConfigLoader>
  );
}

function GatewayOverviewSetupContent({
  organizationId,
  projects,
  config,
  onFinish,
}: GatewayOverviewSetupProps & { config: GatewayConfig | null }) {
  const { activeStep, connectedProviders } = useGatewaySetupProgress({
    organizationId,
    config,
  });
  const availableProviders = new Set(getAvailableGatewayProviders());
  const heroProviders = HERO_PROVIDER_ORDER.filter((provider) =>
    availableProviders.has(provider),
  ).map((provider) => ({
    provider,
    isConnected: connectedProviders.has(provider),
  }));

  return (
    <div className="flex flex-col gap-8 pb-6">
      <GatewaySetupHero
        stepsDone={STEPS_DONE[activeStep]}
        providers={heroProviders}
      />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="rounded-lg border p-6">
          <ConnectedGatewaySetupGuide
            organizationId={organizationId}
            config={config}
            projects={projects}
            onFinish={onFinish}
          />
        </div>
        <GatewaySetupHighlights />
      </div>
    </div>
  );
}
