import {
  gatewayModelsApiHandler,
  withGatewayModelsAuth,
} from "@/src/features/ai-gateway/server";

export default withGatewayModelsAuth(gatewayModelsApiHandler);
