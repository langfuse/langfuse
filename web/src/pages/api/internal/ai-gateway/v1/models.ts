import { gatewayModelsApiHandler } from "@/src/features/ai-gateway/server/provider/models/gatewayModelsApiHandler";
import { withGatewayModelsSignatureVerification } from "@/src/features/ai-gateway/server/auth/gatewayRequestSignatureVerifier";

export default withGatewayModelsSignatureVerification(gatewayModelsApiHandler);
