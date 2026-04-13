import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { env } from "@/src/env.mjs";

const getServerOrigin = () => {
  const origin = env.NEXTAUTH_URL?.replace("/api/auth", "") ?? "";
  return origin && !/^https?:\/\//.test(origin) ? `https://${origin}` : origin;
};

export function useLangfuseBaseUrl(): string {
  const uiCustomization = useUiCustomization();
  return `${
    uiCustomization?.hostname ??
    (typeof window !== "undefined" ? window.origin : getServerOrigin())
  }${env.NEXT_PUBLIC_BASE_PATH ?? ""}`;
}

export function useLangfuseEnvCode(keys?: {
  secretKey: string;
  publicKey: string;
}): string {
  const baseUrl = useLangfuseBaseUrl();

  if (keys) {
    return `LANGFUSE_SECRET_KEY="${keys.secretKey}"
LANGFUSE_PUBLIC_KEY="${keys.publicKey}"
LANGFUSE_BASE_URL="${baseUrl}"`;
  }

  return `LANGFUSE_SECRET_KEY="sk-lf-..."
LANGFUSE_PUBLIC_KEY="pk-lf-..."
LANGFUSE_BASE_URL="${baseUrl}"`;
}
