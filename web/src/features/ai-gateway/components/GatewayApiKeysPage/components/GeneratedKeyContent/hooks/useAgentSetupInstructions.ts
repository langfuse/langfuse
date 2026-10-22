import { useSession } from "next-auth/react";

import { GATEWAY_USER_ID_PLACEHOLDER } from "@/src/features/ai-gateway/constants/agentSetupInstructions";
import { buildAgentSetupInstructions } from "@/src/features/ai-gateway/fns/agentSetupInstructions/buildAgentSetupInstructions";
import { api } from "@/src/utils/api";

/** Characters that would need escaping in a shell, TOML or JSON string. */
const UNSAFE_SNIPPET_CHARACTERS = /["'`$\\\s]/;

export function useAgentSetupInstructions(organizationId: string) {
  const { data: session } = useSession();
  const clientSetup = api.aiGateway.getClientSetup.useQuery({
    orgId: organizationId,
  });

  const email = session?.user?.email;
  const userId =
    email && !UNSAFE_SNIPPET_CHARACTERS.test(email)
      ? email
      : GATEWAY_USER_ID_PLACEHOLDER;

  return {
    instructions: clientSetup.data
      ? buildAgentSetupInstructions({
          gatewayOrigin: new URL(clientSetup.data.gatewayBaseUrl).origin,
          userId,
          providers: clientSetup.data.providers,
        })
      : undefined,
    isPending: clientSetup.isPending,
    isError: clientSetup.isError,
  };
}
