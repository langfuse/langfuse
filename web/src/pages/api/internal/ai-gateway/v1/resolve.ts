import {
  handleGatewayResolveRequest,
  withGatewayResolveAuth,
} from "@/src/features/llm-gateway/server";

export default withGatewayResolveAuth(handleGatewayResolveRequest);
