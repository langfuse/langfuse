export const createOrganizationRoute = "/setup";

export const createProjectRoute = (orgId: string) =>
  `/organization/${orgId}/setup?orgstep=create-project`;

export const inviteMembersRoute = (orgId: string) =>
  `/organization/${orgId}/setup?orgstep=invite-members`;

export const setupTracingRoute = (projectId: string) =>
  `/project/${projectId}/setup`;
