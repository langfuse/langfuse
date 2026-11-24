import { useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { KeyRound, User } from "@langfuse/icons";

import type { AsyncAutocompleteOption } from "@/src/components/AsyncAutocompleteInput/AsyncAutocompleteInput";
import type { GatewayGuardrailTargetPicker } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/components/GatewayGuardrailTargetsInput/GatewayGuardrailTargetsInput";
import {
  API_KEY_TARGET_PREFIX,
  USER_TARGET_PREFIX,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/guardrailTargetConstants";
import { api } from "@/src/utils/api";

/** Searches org members and gateway API keys for the guardrail Applies to picker. */
export function useGatewayGuardrailTargetPicker(
  organizationId: string,
  enabled: boolean,
): GatewayGuardrailTargetPicker {
  const [search, setSearch] = useState("");
  const targetsQuery = api.aiGateway.guardrails.searchTargets.useQuery(
    {
      orgId: organizationId,
      searchQuery: search || undefined,
    },
    {
      enabled,
      placeholderData: keepPreviousData,
    },
  );

  const options = useMemo<AsyncAutocompleteOption[]>(() => {
    if (!targetsQuery.data) return [];
    const users: AsyncAutocompleteOption[] = targetsQuery.data.users.map(
      (user) => ({
        value: `${USER_TARGET_PREFIX}${user.id}`,
        label: user.name || user.email || user.id,
        secondaryLabel: user.name && user.email ? user.email : undefined,
        icon: User,
      }),
    );
    const apiKeys: AsyncAutocompleteOption[] = targetsQuery.data.apiKeys.map(
      (apiKey) => ({
        value: `${API_KEY_TARGET_PREFIX}${apiKey.id}`,
        label: apiKey.name,
        secondaryLabel: apiKey.ownerLabel ?? "API key",
        icon: KeyRound,
      }),
    );
    return [...users, ...apiKeys];
  }, [targetsQuery.data]);

  return {
    options,
    search,
    onSearchChange: setSearch,
    isLoading: targetsQuery.isLoading,
  };
}
