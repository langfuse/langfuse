import { keepPreviousData } from "@tanstack/react-query";

import {
  MAX_MEMBER_SEARCH_LENGTH,
  MAX_TEAM_INVITES,
} from "@/src/features/ai-gateway/constants/gatewayTeamInvites";
import { api } from "@/src/utils/api";

/** Members to offer as quick picks, refilled as members are picked and narrowed by `search`. */
export function useTeamInviteMemberSuggestions({
  organizationId,
  search,
  excludeEmails,
  enabled,
}: {
  organizationId: string;
  search: string;
  excludeEmails: string[];
  enabled: boolean;
}) {
  const query = api.aiGateway.getMemberSuggestions.useQuery(
    {
      orgId: organizationId,
      search: search.trim().slice(0, MAX_MEMBER_SEARCH_LENGTH),
      excludeEmails: excludeEmails.slice(0, MAX_TEAM_INVITES),
    },
    { enabled, placeholderData: keepPreviousData },
  );
  return query.data ?? [];
}
