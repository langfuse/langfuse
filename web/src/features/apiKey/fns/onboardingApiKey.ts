/* eslint-disable @repo/export-rules */
import { type SystemRole } from "@langfuse/shared/src/db";

import { apiKeyRoleDisplay } from "@/src/features/apiKey/fns/apiKeyRoleDisplay";

const ONBOARDING_API_KEY_NAME = "onboarding-setup-key";

/** onboardingApiKeyCreateInput is the one-click onboarding key: Developer where key roles are on, the server's legacy default otherwise, never expiring. */
export function onboardingApiKeyCreateInput(
  projectId: string,
  roleSelectionEnabled: boolean,
): { projectId: string; name: string; role?: SystemRole } {
  if (!roleSelectionEnabled) {
    return { projectId, name: ONBOARDING_API_KEY_NAME };
  }
  return { projectId, name: ONBOARDING_API_KEY_NAME, role: "MEMBER" };
}

type OnboardingApiKeyHint = {
  sentence: string;
  tooltip: { label: string; text: string };
};

/** onboardingApiKeyHint is the setup sentence and permissions tooltip for the key onboardingApiKeyCreateInput creates. */
export function onboardingApiKeyHint(
  roleSelectionEnabled: boolean,
): OnboardingApiKeyHint {
  if (!roleSelectionEnabled) {
    return keyHint(
      apiKeyRoleDisplay("ADMIN").name,
      "Reads and writes all project data. Cannot manage API keys or members. Never expires.",
    );
  }
  const developer = apiKeyRoleDisplay("MEMBER");
  return keyHint(
    developer.name,
    `${developer.description} Cannot manage API keys or members. Never expires.`,
  );
}

function keyHint(roleName: string, permissions: string): OnboardingApiKeyHint {
  return {
    sentence: `Create a ${roleName} key to set you up.`,
    tooltip: { label: `What a ${roleName} key can do`, text: permissions },
  };
}
