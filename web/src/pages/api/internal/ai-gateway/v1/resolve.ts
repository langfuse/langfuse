import { gatewayResolveApiHandler } from "@/src/features/ai-gateway/server/resolve/gatewayResolveApiHandler";
import { withGatewayResolveSignatureVerification } from "@/src/features/ai-gateway/server/auth/gatewayRequestSignatureVerifier";

export default withGatewayResolveSignatureVerification(
  gatewayResolveApiHandler,
);

export const config = {
  api: {
    bodyParser: false,
  },
};
