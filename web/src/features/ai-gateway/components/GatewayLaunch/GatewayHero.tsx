import styles from "@/src/features/ai-gateway/components/GatewayLaunch/gatewayLaunch.module.css";
import { GatewaySwitchboard } from "@/src/features/ai-gateway/components/GatewayLaunch/GatewaySwitchboard";
import { cn } from "@/src/utils/tailwind";

/** Dialog illustration; crops around its center as short dialogs shrink it. */
export function GatewayHero() {
  return (
    <div
      className={cn(
        "bg-surface-section h-72 min-h-48 overflow-hidden border-b",
        styles.dotGrid,
      )}
    >
      <GatewaySwitchboard variant="dialog" />
    </div>
  );
}
