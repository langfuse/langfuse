export function canReadGatewayModels({
  organizationId,
  demoOrganizationId,
  canReadGateway,
  canManageGateway,
}: {
  organizationId: string;
  demoOrganizationId?: string;
  canReadGateway: boolean;
  canManageGateway: boolean;
}) {
  return (
    canReadGateway &&
    (organizationId !== demoOrganizationId || canManageGateway)
  );
}
