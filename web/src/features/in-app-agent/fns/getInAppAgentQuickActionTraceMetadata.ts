import {
  QUICK_ACTION_CATEGORY_CONTEXT_DESCRIPTION,
  QUICK_ACTION_KEY_CONTEXT_DESCRIPTION,
} from "@/src/features/in-app-agent/context";
import {
  isInAppAgentQuickActionContext,
  type InAppAgentQuickActionAttribution,
} from "@/src/features/in-app-agent/quickActions";
import { type AgUiRunAgentInput } from "@langfuse/shared/in-app-agent";

type InAppAgentContext = AgUiRunAgentInput["context"];

const MAX_QUICK_ACTION_KEY_LENGTH = 80;
const QUICK_ACTION_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function getInAppAgentQuickActionTraceMetadata(
  context: InAppAgentContext,
): Record<string, string> {
  const attribution = getInAppAgentQuickActionAttribution(context);

  return attribution
    ? {
        quick_action_key: attribution.key,
        quick_action_category: attribution.category,
      }
    : {};
}

// Attribution is telemetry only: it is validated by shape here and read for
// trace metadata, but never forwarded into the model-visible sanitized context.
function getInAppAgentQuickActionAttribution(
  context: InAppAgentContext,
): InAppAgentQuickActionAttribution | undefined {
  const quickActionKey = context
    .find((item) => item.description === QUICK_ACTION_KEY_CONTEXT_DESCRIPTION)
    ?.value.trim();
  const quickActionCategory = context
    .find(
      (item) => item.description === QUICK_ACTION_CATEGORY_CONTEXT_DESCRIPTION,
    )
    ?.value.trim();

  if (
    !quickActionKey ||
    quickActionKey.length > MAX_QUICK_ACTION_KEY_LENGTH ||
    !QUICK_ACTION_KEY_PATTERN.test(quickActionKey) ||
    !quickActionCategory ||
    !isInAppAgentQuickActionContext(quickActionCategory)
  ) {
    return undefined;
  }

  return { key: quickActionKey, category: quickActionCategory };
}
