import {
  gatewayResolveApiHandler,
  withGatewayResolveSignatureVerification,
} from "@/src/features/ai-gateway/server";

export default withGatewayResolveSignatureVerification(
  gatewayResolveApiHandler,
);

export const config = {
  api: {
    bodyParser: false,
  },
};
