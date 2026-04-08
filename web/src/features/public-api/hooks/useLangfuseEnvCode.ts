import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { env } from "@/src/env.mjs";

export function useLangfuseEnvCode(keys?: {
  secretKey: string;
  publicKey: string;
}): string {
  const uiCustomization = useUiCustomization();
  const origin =
    uiCustomization?.hostname ??
    (typeof window !== "undefined"
      ? window.origin
      : env.NEXTAUTH_URL?.replace("/api/auth", "") ?? "http://localhost:3000");
  const baseUrl = `${origin}${env.NEXT_PUBLIC_BASE_PATH ?? ""}`;

  if (keys) {
    return `LANGFUSE_SECRET_KEY="${keys.secretKey}"
LANGFUSE_PUBLIC_KEY="${keys.publicKey}"
LANGFUSE_BASE_URL="${baseUrl}"`;
  }

  return `LANGFUSE_SECRET_KEY="sk-lf-..."
LANGFUSE_PUBLIC_KEY="pk-lf-..."
LANGFUSE_BASE_URL="${baseUrl}"`;
}
