import {
  gatewayModelsApiHandler,
  withGatewayModelsSignatureVerification,
} from "@/src/features/ai-gateway/server";

export default withGatewayModelsSignatureVerification(gatewayModelsApiHandler);
