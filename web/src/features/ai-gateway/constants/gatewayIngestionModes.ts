import { EyeOff, Gauge, ScanText, type IconComponent } from "@langfuse/icons";
import type { GatewayIngestionMode } from "@langfuse/shared";

export const GATEWAY_INGESTION_MODES: ReadonlyArray<{
  value: GatewayIngestionMode;
  title: string;
  description: string;
  icon: IconComponent;
}> = [
  {
    value: "FULL",
    title: "Full",
    description: "Capture full request and response payloads for tracing.",
    icon: ScanText,
  },
  {
    value: "USAGE",
    title: "Usage",
    description: "Capture model, token usage, cost, and latency.",
    icon: Gauge,
  },
  {
    value: "NONE",
    title: "None",
    description: "Route requests without capturing anything in Langfuse.",
    icon: EyeOff,
  },
];
