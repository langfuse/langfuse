import {
  gatewayResolveApiHandler,
  withGatewayResolveAuth,
} from "@/src/features/llm-gateway/server";

export default withGatewayResolveAuth(gatewayResolveApiHandler);

export const config = {
  api: {
    bodyParser: false,
  },
};
