import type { IconComponent } from "@langfuse/icons";
import {
  AwsColorMark,
  AzureColorMark,
  GeminiColorMark,
  GoogleCloudColorMark,
} from "@langfuse/icons/brand";

import { providerIcons } from "@/src/features/ai-gateway/constants/providerIcons";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export const providerColorIcons = {
  ...providerIcons,
  BEDROCK: AwsColorMark,
  AZURE: AzureColorMark,
  GOOGLE_AI_STUDIO: GeminiColorMark,
  VERTEX: GoogleCloudColorMark,
} satisfies Record<GatewayProvider, IconComponent>;
