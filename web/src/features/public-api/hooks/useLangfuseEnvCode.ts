import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { env } from "@/src/env.mjs";

/** projectIdPlaceholder stands in for the project id in an organization key's examples. */
export const projectIdPlaceholder = "<your-project-id>";

/** SECRET_KEY_PLACEHOLDER stands in for a secret key the page cannot show. */
const SECRET_KEY_PLACEHOLDER = "sk-lf-...";

/** LangfuseEnvCredentials are the values the SDK environment variables carry. */
type LangfuseEnvCredentials = {
  /** projectId goes in LANGFUSE_PUBLIC_KEY, where SDKs send it as the Basic auth username. */
  projectId: string;
  secretKey?: string;
};

function getLangfuseBaseUrl(baseUrl: string): string {
  return `${baseUrl}${env.NEXT_PUBLIC_BASE_PATH ?? ""}`;
}

/** getLangfuseEnvCode returns the SDK environment variables for a project. */
export function getLangfuseEnvCode(
  baseUrl: string,
  { projectId, secretKey = SECRET_KEY_PLACEHOLDER }: LangfuseEnvCredentials,
): string {
  return `
LANGFUSE_SECRET_KEY="${secretKey}"
LANGFUSE_PUBLIC_KEY="${projectId}"
LANGFUSE_BASE_URL="${baseUrl}"
`.trim();
}

export function useLangfuseBaseUrl(): string {
  const uiCustomization = useUiCustomization();

  return getLangfuseBaseUrl(uiCustomization?.hostname ?? window.origin);
}

/** useLangfuseEnvCode returns the SDK environment variables for a project, without a secret key. */
export function useLangfuseEnvCode(projectId: string): string {
  const baseUrl = useLangfuseBaseUrl();

  return getLangfuseEnvCode(baseUrl, { projectId });
}
