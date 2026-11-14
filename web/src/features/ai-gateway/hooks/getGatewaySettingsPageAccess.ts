import { gatewayPageAccess } from "@/src/features/ai-gateway/fns/gatewayPageAccess";
import {
  getSessionEnvironment,
  type MaybeSession,
} from "@/src/features/rbac/new/sessionAccessors";

/** getGatewaySettingsPageAccess is which gateway settings the member sees, given whether the session's deployment runs the gateway. */
export function getGatewaySettingsPageAccess(
  session: MaybeSession,
  access: Omit<Parameters<typeof gatewayPageAccess>[0], "aiGatewayDeployed">,
) {
  return gatewayPageAccess({
    ...access,
    aiGatewayDeployed: getSessionEnvironment(session)?.aiGatewayDeployed,
  });
}
