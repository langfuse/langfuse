import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { getAppBaseUrl } from "@/src/utils/app-base-url";

export function useLangfuseEnvCode(keys?: {
  secretKey: string;
  publicKey: string;
}): string {
  const uiCustomization = useUiCustomization();
  const baseUrl = getAppBaseUrl(uiCustomization?.hostname);

  if (keys) {
    return `LANGFUSE_SECRET_KEY="${keys.secretKey}"
LANGFUSE_PUBLIC_KEY="${keys.publicKey}"
LANGFUSE_BASE_URL="${baseUrl}"`;
  }

  return `LANGFUSE_SECRET_KEY="sk-lf-..."
LANGFUSE_PUBLIC_KEY="pk-lf-..."
LANGFUSE_BASE_URL="${baseUrl}"`;
}
