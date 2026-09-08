import {
  gatewayResolveApiHandler,
  withGatewayResolveAuth,
} from "@/src/features/ai-gateway/server";

export default withGatewayResolveAuth(gatewayResolveApiHandler);

export const config = {
  api: {
    bodyParser: false,
  },
};
