import { Boxes, Plug, Plus } from "@langfuse/icons";

import { GatewaySetupEmptyState } from "@/src/features/ai-gateway/components/GatewaySetupEmptyState/GatewaySetupEmptyState";

/** The models list only includes enabled credentials, so "no providers" also covers errored or disabled ones. */
const EMPTY_STATE_COPY = {
  noProviders: {
    icon: Plug,
    title: "No active provider credentials",
    managerDescription:
      "Add an OpenAI or Anthropic credential, or fix an existing one, so the gateway can route requests and discover models.",
    memberDescription:
      "Ask your organization admin to add or fix a provider credential.",
  },
  noModels: {
    icon: Boxes,
    title: "No models available",
    managerDescription:
      "Your provider credentials returned no enabled models. Enable models on a credential, or add another credential.",
    /** Members read cached models only, so an empty list can mean "not discovered yet" rather than "disabled". */
    memberDescription:
      "No models have been discovered for your organization's provider credentials yet. Check back later, or ask your organization admin if this persists.",
  },
};

export type GatewayModelsEmptyStateProps = {
  organizationId: string;
  /** Whether any enabled provider credential exists. */
  hasProviders: boolean;
  /** Omit for members who cannot add provider credentials. */
  onAddProvider?: () => void;
};

export function GatewayModelsEmptyState({
  organizationId,
  hasProviders,
  onAddProvider,
}: GatewayModelsEmptyStateProps) {
  const copy = hasProviders
    ? EMPTY_STATE_COPY.noModels
    : EMPTY_STATE_COPY.noProviders;

  if (!onAddProvider) {
    return (
      <GatewaySetupEmptyState
        icon={copy.icon}
        title={copy.title}
        description={copy.memberDescription}
      />
    );
  }
  return (
    <GatewaySetupEmptyState
      icon={copy.icon}
      title={copy.title}
      description={copy.managerDescription}
      actions={[
        {
          type: "button",
          label: "Add credential",
          icon: Plus,
          onClick: onAddProvider,
        },
        {
          type: "link",
          label: "Manage credentials",
          href: `/organization/${encodeURIComponent(organizationId)}/settings/ai-gateway`,
        },
      ]}
    />
  );
}
