import { ArrowRight } from "@langfuse/icons";
import { SiAnthropic, SiOpenai } from "@langfuse/icons/si";

import styles from "@/src/features/ai-gateway/components/GatewayLaunch/gatewayLaunch.module.css";
import { GatewayReceipt } from "@/src/features/ai-gateway/components/GatewayLaunch/GatewayReceipt";
import { cn } from "@/src/utils/tailwind";

/** Illustration: provider spend flowing into a per-person receipt; shrinks first in short dialogs. */
export function GatewayHero() {
  return (
    <div
      className={cn(
        "bg-surface-section flex h-72 min-h-48 items-center justify-center gap-5 overflow-hidden border-b px-8",
        styles.dotGrid,
      )}
    >
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-2xs font-mono tracking-wider whitespace-nowrap">
          WHAT THE PROVIDERS SEND YOU
        </span>
        <div className="bg-background flex items-center gap-6 border px-3 py-2.5">
          <span className="flex items-center gap-2">
            <SiAnthropic size="base" />
            <SiOpenai size="base" />
          </span>
          <span className="font-mono text-xs font-bold">$58,240.22</span>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="text-muted-foreground mt-6 flex items-center"
      >
        <span className="border-muted-foreground w-10 border-t border-dashed" />
        <ArrowRight size="sm" color="muted" __rawClassName="-ml-1" />
      </div>
      <div className="w-64 shrink-0">
        <GatewayReceipt variant="dialog" />
      </div>
    </div>
  );
}
