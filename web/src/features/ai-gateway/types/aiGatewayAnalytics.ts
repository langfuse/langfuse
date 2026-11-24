import type {
  GatewayIngestionMode,
  GatewaySpendLimitScope,
} from "@langfuse/shared";

import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import type { GatewayApiKeyExpirationPreset } from "@/src/features/ai-gateway/constants/gatewayApiKeyExpirationOptions";
import type { GatewayIngestionSettings } from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import type { AgentSetupInstructions } from "@/src/features/ai-gateway/types/agentSetupInstructions";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

// Gateway adoption funnel: setup guide -> credentials -> team -> keys -> model
// access. Metadata only — enums, counts and booleans. Never email addresses,
// connection or key names, credentials, metadata keys/values or model ids
// (fine-tuned model ids can embed customer names).

type OrganizationContext = { orgId: string };

/** The setup guide shown to new organizations, or the settings overview afterwards. */
export type GatewaySettingsSurface = "setup_guide" | "overview";

/** Credentials can also be added from the models page's empty state. */
export type GatewayCredentialSurface = GatewaySettingsSurface | "models_page";

/** Whether a connection overrides its endpoint; never the URL or header names. */
type GatewayEndpointUsage = {
  hasCustomBaseUrl: boolean;
  extraHeaderCount: number;
};

/** Every saved or removed spend budget, wherever it was edited. */
type GatewayBudgetChange = OrganizationContext & {
  surface: "budgets_page" | "setup_guide" | "api_key_dialog";
  scope: GatewaySpendLimitScope;
  /** Keys or users the change applied to; 1 for organization and default budgets. */
  subjectCount: number;
};

export type AiGatewayEventMap = {
  "ai_gateway:setup_guide_viewed": OrganizationContext;
  "ai_gateway:setup_step_completed": OrganizationContext &
    (
      | {
          step: "ingestion";
          stepNumber: 1;
          ingestionMode: GatewayIngestionMode;
        }
      | { step: "credential"; stepNumber: 2; provider: GatewayProvider }
      | { step: "budgets"; stepNumber: 3; isSkipped: boolean }
      | { step: "team_invite"; stepNumber: 4; isSkipped: boolean }
      | { step: "api_key"; stepNumber: 5; isSkipped: boolean }
    );
  "ai_gateway:ingestion_settings_saved": OrganizationContext &
    Pick<GatewayIngestionSettings, "ingestionMode" | "projectTarget"> & {
      surface: GatewaySettingsSurface;
    };
  "ai_gateway:provider_credential_added": OrganizationContext &
    GatewayEndpointUsage & {
      surface: GatewayCredentialSurface;
      provider: GatewayProvider;
      isFirstCredential: boolean;
    };
  "ai_gateway:provider_credential_updated": OrganizationContext &
    GatewayEndpointUsage & {
      provider: GatewayProvider;
      isRenamed: boolean;
      isCredentialReplaced: boolean;
    };
  "ai_gateway:provider_credential_deleted": OrganizationContext & {
    provider: GatewayProvider;
  };
  "ai_gateway:team_invite_sent": OrganizationContext & {
    surface: "setup_guide" | "api_keys_page";
    /** Addresses typed into the form. */
    emailCount: number;
    /** Typed addresses that became new organization invitations. */
    invitedCount: number;
    /** Typed addresses that already belonged to organization members. */
    existingMemberCount: number;
    /** Members emailed the gateway announcement, typed or via "notify members". */
    notifiedMemberCount: number;
    failedCount: number;
    isNotifyMembersEnabled: boolean;
  };
  "ai_gateway:api_key_created": OrganizationContext & {
    isServiceAccount: boolean;
    hasMetadata: boolean;
    metadataCount: number;
    hasDescription: boolean;
    expiryPreset: GatewayApiKeyExpirationPreset;
    /** Null when the key was created without a spend budget. */
    spendBudgetInterval: GatewaySpendBudgetInterval | null;
    /** 0 when the key may call every enabled model. */
    modelPatternCount: number;
  };
  "ai_gateway:api_key_updated": OrganizationContext & {
    metadataCount: number;
    /** 0 when the key may call every enabled model. */
    modelPatternCount: number;
  };
  "ai_gateway:api_key_revoked": OrganizationContext;
  /** The one-time secret was copied; the key itself is never sent. */
  "ai_gateway:api_key_secret_copied": OrganizationContext;
  "ai_gateway:api_key_secret_revealed": OrganizationContext;
  "ai_gateway:model_access_changed": OrganizationContext & {
    provider: GatewayProvider;
    action: "enable" | "disable";
    /** Row switch or bulk selection. */
    scope: "single" | "selection";
    /** Models the action targeted. */
    modelCount: number;
    /** Targeted models whose state actually flipped. */
    changedModelCount: number;
    enabledModelCount: number;
    totalModelCount: number;
  };
  // The copied slug embeds the connection name, so only the provider is sent.
  "ai_gateway:model_name_copied": OrganizationContext & {
    provider: GatewayProvider;
  };
  "ai_gateway:custom_model_added": OrganizationContext & {
    provider: GatewayProvider;
  };
  "ai_gateway:custom_model_removed": OrganizationContext & {
    provider: GatewayProvider;
  };
  "ai_gateway:budget_saved": GatewayBudgetChange & {
    interval: GatewaySpendBudgetInterval;
  };
  "ai_gateway:budget_removed": GatewayBudgetChange;
  /** The user expanded a tool's setup steps ("Show all steps") after creating a key. */
  "ai_gateway:agent_setup_instructions_viewed": OrganizationContext & {
    agentId: AgentSetupInstructions["id"];
    hasProviderWarning: boolean;
  };
  "ai_gateway:agent_setup_instructions_copied": OrganizationContext & {
    agentId: AgentSetupInstructions["id"];
  } & (
      | { source: "copy_for_agent" }
      | { source: "step_code"; stepNumber: number }
    );
};
