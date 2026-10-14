import {
  gatewayAuthenticateApiHandler,
  withGatewayAuthenticateSignatureVerification,
} from "@/src/features/ai-gateway/server";

export default withGatewayAuthenticateSignatureVerification(
  gatewayAuthenticateApiHandler,
);
