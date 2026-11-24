import type { RouterOutputs } from "@/src/utils/api";

export type GatewayGuardrailRow =
  RouterOutputs["aiGateway"]["guardrails"]["list"]["rows"][number];
