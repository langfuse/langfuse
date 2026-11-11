/**
 * Mutation scope shared by every write that sends the connection's
 * `expectedUpdatedAt`, so they run one after another instead of conflicting.
 */
export function getGatewayConnectionWriteScope(connectionId: string) {
  return { id: `gateway-connection-write:${connectionId}` };
}
