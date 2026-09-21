export const createOrganizationRoute = "/setup";

export const createProjectRoute = (orgId: string) =>
  `/organization/${orgId}/setup?orgstep=create-project`;

export const setupTracingRoute = (projectId: string) =>
  `/project/${projectId}/traces/setup`;
