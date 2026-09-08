import {
  gatewayModelsApiHandler,
  withGatewayModelsAuth,
} from "@/src/features/llm-gateway/server";

export default withGatewayModelsAuth(gatewayModelsApiHandler);

export const config = {
  api: {
    bodyParser: false,
  },
};
