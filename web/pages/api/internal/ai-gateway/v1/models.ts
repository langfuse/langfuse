import {
  gatewayModelsApiHandler,
  withGatewayModelsSignatureVerification,
} from "@/src/ai/gateway/management-ui/server";

export default withGatewayModelsSignatureVerification(gatewayModelsApiHandler);
