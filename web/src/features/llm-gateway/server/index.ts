// Gateway authentication and request handling
export {
  buildGatewayHmacCanonicalMessage,
  createGatewayHmacSignature,
  issueGatewayIngestionToken,
  verifyGatewayHmacAuthorization,
  verifyGatewayIngestionToken,
} from "./auth";
export { withGatewayResolveAuth } from "./gatewayResolveAuth";
export { handleGatewayResolveRequest } from "./handleGatewayResolveRequest";
export { verifyGatewayIngestionAuthorization } from "./ingestionTokenVerification";

// Provider handling and resolution
export { GatewayProviderService } from "./gatewayProviderService";
export {
  getGatewayProviderDefinition,
  providerSupportsApiFormat,
} from "./providerRegistry";
export { GatewayResolveError, GatewayResolveService } from "./resolveService";

export { llmGatewayRouter } from "./router";
