import type { RouterOutputs } from "@/src/utils/api";

export type GatewayGuardrailRow =
  RouterOutputs["aiGateway"]["listGuardrails"]["rows"][number];
