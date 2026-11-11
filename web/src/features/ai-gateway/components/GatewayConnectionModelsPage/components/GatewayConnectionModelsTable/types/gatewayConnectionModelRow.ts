import type { ApiFormat } from "@/src/features/ai-gateway/fns/getGatewayModelApiFormats";

export type GatewayConnectionModelRow = {
  id: string;
  custom: boolean;
  apiFormats: ApiFormat[];
};
