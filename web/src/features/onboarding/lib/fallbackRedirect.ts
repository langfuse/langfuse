/** Where a user lands without a known destination: "/" for members (it lists their projects), else /setup if they can create an organization. */
export const getFallbackRedirectPath = ({
  hasOrganizations,
  canCreateOrganizations,
}: {
  hasOrganizations: boolean;
  canCreateOrganizations: boolean;
}) => (canCreateOrganizations && !hasOrganizations ? "/setup" : "/");
