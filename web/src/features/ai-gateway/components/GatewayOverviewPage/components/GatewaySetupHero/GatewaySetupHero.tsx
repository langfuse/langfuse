import styles from "@/src/features/ai-gateway/components/GatewayLaunch/gatewayLaunch.module.css";
import {
  GatewaySetupSwitchboard,
  type GatewaySetupSwitchboardProps,
} from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewaySetupHero/GatewaySetupSwitchboard";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import { cn } from "@/src/utils/tailwind";

const TOTAL_STEPS = 3;

const progressWidths = {
  0: "w-0",
  1: "w-1/3",
  2: "w-2/3",
  3: "w-full",
} as const;

export type GatewaySetupHeroProps = GatewaySetupSwitchboardProps & {
  stepsDone: keyof typeof progressWidths;
};

/** Overview banner while the gateway is not set up; it fills in as setup progresses. */
export function GatewaySetupHero({
  stepsDone,
  providers,
}: GatewaySetupHeroProps) {
  const connectedLabels = providers
    .filter(({ isConnected }) => isConnected)
    .map(({ provider }) => providerLabels[provider]);

  return (
    <section
      aria-labelledby="gateway-setup-hero-title"
      className={cn(
        "bg-surface-section flex items-center gap-8 overflow-hidden rounded-lg p-6",
        styles.dotGrid,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
          Setup · About 2 minutes
        </span>
        <h2 id="gateway-setup-hero-title" className="text-2xl font-bold">
          Set up Langfuse AI Gateway
        </h2>
        <p className="text-muted-foreground max-w-xl text-sm">
          Route Claude Code, Codex, OpenCode, and your own apps through
          Langfuse. Each call becomes a full trace, along with who made it and
          what it cost.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div
            role="progressbar"
            aria-label="Gateway setup progress"
            aria-valuemin={0}
            aria-valuemax={TOTAL_STEPS}
            aria-valuenow={stepsDone}
            className="bg-border h-1 w-40 overflow-hidden rounded-full"
          >
            <div
              className={cn(
                "bg-foreground h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500",
                progressWidths[stepsDone],
              )}
            />
          </div>
          <span className="text-muted-foreground font-mono text-xs">
            {stepsDone} of {TOTAL_STEPS} steps done
          </span>
        </div>
        <p className="sr-only">
          {connectedLabels.length > 0
            ? `Connected providers: ${connectedLabels.join(", ")}.`
            : "No provider connected yet."}
        </p>
      </div>
      <div className="hidden h-52 w-112 shrink-0 lg:block">
        <GatewaySetupSwitchboard providers={providers} />
      </div>
    </section>
  );
}
