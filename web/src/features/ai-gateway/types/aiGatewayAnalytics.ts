import type { GatewayIngestionMode } from "@langfuse/shared";

import type { ApiKeyExpirationPreset } from "@/src/features/apiKey/constants/apiKeyExpirationOptions";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

// Gateway adoption funnel: setup guide -> credentials -> team -> keys -> model
// access. Metadata only — enums, counts and booleans. Never email addresses,
// connection or key names, credentials, metadata keys/values or model ids
// (fine-tuned model ids can embed customer names).

type OrganizationContext = { orgId: string };

/** The setup guide shown to new organizations, or the settings overview afterwards. */
export type GatewaySettingsSurface = "setup_guide" | "overview";

export type GatewayTeamInviteSurface = "setup_guide" | "api_keys_page";

type SetupStep =
  | { step: "ingestion"; stepNumber: 1; ingestionMode: GatewayIngestionMode }
  | { step: "credential"; stepNumber: 2; provider: GatewayProvider }
  | { step: "team_invite"; stepNumber: 3; isSkipped: boolean };

export type AiGatewayEventMap = {
  "ai_gateway:setup_guide_viewed": OrganizationContext;
  "ai_gateway:setup_step_completed": OrganizationContext & SetupStep;
  "ai_gateway:ingestion_settings_saved": OrganizationContext & {
    surface: GatewaySettingsSurface;
    ingestionMode: GatewayIngestionMode;
    projectTarget: "new" | "existing";
  };
  "ai_gateway:provider_credential_added": OrganizationContext & {
    surface: GatewaySettingsSurface;
    provider: GatewayProvider;
    isFirstCredential: boolean;
  };
  "ai_gateway:provider_credential_updated": OrganizationContext & {
    provider: GatewayProvider;
    isRenamed: boolean;
    isCredentialReplaced: boolean;
  };
  "ai_gateway:provider_credential_deleted": OrganizationContext & {
    provider: GatewayProvider;
  };
  "ai_gateway:team_invite_sent": OrganizationContext & {
    surface: GatewayTeamInviteSurface;
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
    expiryPreset: ApiKeyExpirationPreset;
  };
  "ai_gateway:api_key_revoked": OrganizationContext;
  "ai_gateway:model_access_changed": OrganizationContext & {
    provider: GatewayProvider;
    action: "enable" | "disable";
    /** Row switch, bulk selection, or the "Enable all" / "Disable all" buttons. */
    scope: "single" | "selection" | "all";
    /** Models the action targeted. */
    modelCount: number;
    /** Targeted models whose state actually flipped. */
    changedModelCount: number;
    enabledModelCount: number;
    totalModelCount: number;
  };
};
