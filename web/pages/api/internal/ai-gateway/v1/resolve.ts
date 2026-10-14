import {
  gatewayResolveApiHandler,
  withGatewayResolveSignatureVerification,
} from "@/src/ai/gateway/management-ui/server";

export default withGatewayResolveSignatureVerification(
  gatewayResolveApiHandler,
);

export const config = {
  api: {
    bodyParser: false,
  },
};
